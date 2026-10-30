using Microsoft.Win32;
using System.Diagnostics;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
namespace VisionAssist;
public record Config(string target,string extensionId,string profile,string chrome,string highestVersion);
static class Program {
 public static string State=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"VisionAssist");
 public static string Settings=>Path.Combine(State,"settings.json");
 public static Config ReadConfig()=>JsonSerializer.Deserialize<Config>(File.ReadAllText(Settings))!;
 [STAThread]static void Main(string[] args){
  try{
   Directory.CreateDirectory(State);
   if(args.Length>0&&args[0].StartsWith("chrome-extension://",StringComparison.Ordinal)){Native(args[0]).GetAwaiter().GetResult();return;}
   ApplicationConfiguration.Initialize();
   if(args.Contains("--open-delayed")){Thread.Sleep(1800);Open(ReadConfig());return;}
   if(!File.Exists(Settings)||args.Contains("--setup")||Path.GetFileName(Environment.ProcessPath!).EndsWith("-setup.exe",StringComparison.OrdinalIgnoreCase)){Application.Run(new SetupForm());return;}
   var c=ReadConfig();using(var gate=Lock())UpdateCore.Recover(c.target,State);Register(c);Open(c);
  }catch(Exception e){if(args.Length>0&&args[0].StartsWith("chrome-extension://")){try{WriteNative(new{ok=false,message=e.Message});}catch{}}else MessageBox.Show(e.Message,"비전 어시스트",MessageBoxButtons.OK,MessageBoxIcon.Information);}
 }
 static FileStream Lock()=>new(Path.Combine(State,"operation.lock"),FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None);
 static async Task Native(string origin){
  var config=ReadConfig();if(origin!=$"chrome-extension://{config.extensionId}/")throw new IOException("등록된 비전 프로그램에서만 사용할 수 있습니다.");
  var input=Console.OpenStandardInput();byte[] header=new byte[4];await input.ReadExactlyAsync(header);int size=BitConverter.ToInt32(header);if(size<1||size>1048576)throw new IOException("요청 크기가 올바르지 않습니다.");byte[] payload=new byte[size];await input.ReadExactlyAsync(payload);var request=JsonNode.Parse(payload)!;string command=request["command"]?.GetValue<string>()??"";
  if(command=="reopen"){Process.Start(new ProcessStartInfo(Environment.ProcessPath!,"--open-delayed"){UseShellExecute=false});WriteNative(new{ok=true});return;}
  using var gate=Lock();UpdateCore.Recover(config.target,State);
  if(command=="status"){WriteNative(new{ok=true,version=UpdateCore.Manifest(config.target)["version"]?.GetValue<string>(),connected=true});return;}
  if(command=="restore"){
   var last=Path.Combine(State,"last-update.json");if(!File.Exists(last))throw new IOException("복구할 업데이트 기록이 없습니다.");var journal=JsonSerializer.Deserialize<Journal>(File.ReadAllText(last))!;UpdateCore.AtomicJson(Path.Combine(State,"pending.json"),journal);UpdateCore.Restore(journal,config.target,State);File.Delete(Path.Combine(State,"pending.json"));File.Delete(last);WriteNative(new{ok=true,message="이전 파일로 복구했습니다. 다시 열면 적용됩니다."});return;
  }
  if(command is not ("check" or "apply"))throw new IOException("지원하지 않는 요청입니다.");
  string temp=Path.Combine(Path.GetTempPath(),"vision-assist-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(temp);
  try{
   var feed=await UpdateCore.FetchFeed(temp);var current=UpdateCore.Manifest(config.target)["version"]!.GetValue<string>();
   if(command=="check"&&Version.Parse(feed.version)<Version.Parse(current)){WriteNative(new{ok=true,available=false,version=current,message="공개 최신 버전보다 새로운 테스트 버전을 사용 중입니다."});return;}
   if(Version.Parse(feed.version)<Version.Parse(current)||Version.Parse(feed.version)<Version.Parse(config.highestVersion))throw new IOException("현재 또는 이전에 확인한 버전보다 오래된 업데이트입니다.");
   // Manifest serialization differs after preserving extension identity; compare its version separately.
   bool available=feed.version!=current||feed.files.Where(f=>f.path!="manifest.json").Any(f=>!File.Exists(Path.Combine(config.target,f.path))||UpdateCore.Hash(Path.Combine(config.target,f.path))!=f.sha256);
   if(command=="check"||!available){WriteNative(new{ok=true,available,version=feed.version,message=available?"새 버전을 사용할 수 있습니다.":"현재 최신 버전입니다."});return;}
   var archive=Path.Combine(temp,"release.zip");await UpdateCore.Download(feed.url,archive,feed.size);var stage=Path.Combine(temp,"staged");UpdateCore.Expand(feed,archive,stage);UpdateCore.Install(feed,stage,config.target,State);UpdateCore.AtomicJson(Settings,config with{highestVersion=feed.version});WriteNative(new{ok=true,version=feed.version,message="업데이트를 적용했습니다. 새 버전으로 다시 열기를 눌러주세요."});
  }finally{Directory.Delete(temp,true);}
 }
 static void WriteNative(object message){var data=JsonSerializer.SerializeToUtf8Bytes(message);using var output=Console.OpenStandardOutput();output.Write(BitConverter.GetBytes(data.Length));output.Write(data);output.Flush();}
 public static void Register(Config c){
  if(!Regex.IsMatch(c.extensionId,"^[a-p]{32}$"))throw new IOException("확장 연결 ID를 확인해주세요.");
  var exe=Path.Combine(State,"VisionAssist.exe");var current=Environment.ProcessPath!;
  if(!string.Equals(Path.GetFullPath(current),Path.GetFullPath(exe),StringComparison.OrdinalIgnoreCase))File.Copy(current,exe,true);
  var hostPath=Path.Combine(State,"native-host.json");UpdateCore.AtomicJson(hostPath,new{name="kr.co.visionconsulting.assist",description="Vision Assist launcher and update service",path=exe,type="stdio",allowed_origins=new[]{$"chrome-extension://{c.extensionId}/"}});
  using var key=Registry.CurrentUser.CreateSubKey(@"Software\Google\Chrome\NativeMessagingHosts\kr.co.visionconsulting.assist");key.SetValue("",hostPath);
  // A shortcut is created once; subsequent launches never rewrite user documents.
  var desktop=Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);var shortcut=Path.Combine(desktop,"비전 어시스트.lnk");
  if(!File.Exists(shortcut)){dynamic shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell")!)!;dynamic lnk=shell.CreateShortcut(shortcut);lnk.TargetPath=exe;lnk.WorkingDirectory=State;lnk.Description="비전 어시스트";lnk.IconLocation=exe+",0";lnk.Save();}
 }
 public static void Open(Config c){var start=new ProcessStartInfo(c.chrome){UseShellExecute=false};start.ArgumentList.Add("--profile-directory="+c.profile);start.ArgumentList.Add("--window-size=460,560");start.ArgumentList.Add("--app=chrome-extension://"+c.extensionId+(File.Exists(Path.Combine(c.target,"assist.html"))?"/assist.html":"/popup.html"));Process.Start(start);}
 public static List<Config> Discover(){
  var all=new List<Config>();string chrome=FindChrome();string userData=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),@"Google\Chrome\User Data");if(!Directory.Exists(userData))return all;
  foreach(var dir in Directory.GetDirectories(userData).Where(d=>Path.GetFileName(d)=="Default"||Path.GetFileName(d).StartsWith("Profile "))){
   foreach(var name in new[]{"Preferences","Secure Preferences"}){
    try{using var f=new FileStream(Path.Combine(dir,name),FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete);using var json=JsonDocument.Parse(f);if(!json.RootElement.TryGetProperty("extensions",out var ex)||!ex.TryGetProperty("settings",out var settings))continue;
     foreach(var item in settings.EnumerateObject()){
      if(!item.Value.TryGetProperty("path",out var p))continue;var path=p.GetString()!;if(!Path.IsPathRooted(path))path=Path.Combine(dir,"Extensions",path);if(!File.Exists(Path.Combine(path,"cargo-target.js")))continue;
      var manifest=UpdateCore.Manifest(path);if(all.Any(c=>c.extensionId==item.Name&&c.profile==Path.GetFileName(dir)))continue;
      all.Add(new(path,item.Name,Path.GetFileName(dir),chrome,manifest["version"]!.GetValue<string>()));
     }
    }catch{/* Non-Vision entries and files currently being replaced are ignored. */}
   }
  }return all;
 }
 public static string FindChrome(){var roots=new[]{Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)};foreach(var root in roots){var p=Path.Combine(root,@"Google\Chrome\Application\chrome.exe");if(File.Exists(p))return p;}throw new IOException("Google Chrome을 설치한 후 다시 실행해주세요.");}
 public static void InstallEmbedded(string target){
  using var gate=Lock();UpdateCore.Recover(target,State);string temp=Path.Combine(Path.GetTempPath(),"vision-setup-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(temp);
  try{
   using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("core.zip")!){using var dest=File.Create(Path.Combine(temp,"core.zip"));stream.CopyTo(dest);}
   using var reader=new StreamReader(Assembly.GetExecutingAssembly().GetManifestResourceStream("update.json")!);var feed=JsonSerializer.Deserialize<Feed>(reader.ReadToEnd())!;
   if(File.Exists(Path.Combine(target,"manifest.json"))){var installed=UpdateCore.Manifest(target)["version"]!.GetValue<string>();if(Version.Parse(installed)>Version.Parse(feed.version))return;}
   var stage=Path.Combine(temp,"stage");UpdateCore.Expand(feed,Path.Combine(temp,"core.zip"),stage);Directory.CreateDirectory(target);
   if(!File.Exists(Path.Combine(target,"manifest.json"))){UpdateCore.AtomicJson(Path.Combine(target,"manifest.json"),new{name="비전 어시스트",manifest_version=3,version="0.0.0"});File.WriteAllText(Path.Combine(target,"cargo-target.js"),"export const searchTarget=null; export const cargoTarget=null; export const itemTarget=null; export const commonTarget=null; export const followupTarget=null;\n");}
   UpdateCore.Install(feed,stage,target,State);
  }finally{Directory.Delete(temp,true);}
 }
}
public class SetupForm:Form {
 readonly Label message=new(){AutoSize=false,Dock=DockStyle.Fill,Padding=new Padding(25),Font=new Font("Malgun Gothic",11),Text="비전 어시스트를 연결합니다.\n\n기존 UNI-PASS 창은 그대로 두고, 비전 입력 도구 탭만 닫아주세요.\n기존 확장 폴더와 자료를 유지해 설치합니다."};
 readonly ComboBox candidates=new(){Dock=DockStyle.Top,DropDownStyle=ComboBoxStyle.DropDownList,Height=40};
 readonly Button install=new(){Text="연결 준비",Dock=DockStyle.Bottom,Height=52};
 readonly Button finish=new(){Text="연결 확인하고 시작",Dock=DockStyle.Bottom,Height=52,Visible=false};
 List<Config> found=new();string? target;
 public SetupForm(){Text="비전 어시스트 · 처음 연결";Size=new Size(650,430);StartPosition=FormStartPosition.CenterScreen;BackColor=Color.FromArgb(245,246,242);Font=new Font("Malgun Gothic",10);Controls.Add(message);Controls.Add(candidates);Controls.Add(finish);Controls.Add(install);Shown+=(_,_)=>{try{found=Program.Discover();foreach(var c in found)candidates.Items.Add($"기존 프로그램 · {c.profile} · {c.target}");candidates.Items.Add("새로 연결하기");candidates.SelectedIndex=0;}catch(Exception e){message.Text=e.Message;install.Enabled=false;}};install.Click+=Prepare;finish.Click+=Finish;}
 void Prepare(object? sender,EventArgs e){try{
  install.Enabled=false;Config? chosen=candidates.SelectedIndex<found.Count?found[candidates.SelectedIndex]:null;target=chosen?.target??Path.Combine(Program.State,"extension");Program.InstallEmbedded(target);
  if(chosen!=null){var c=chosen with{highestVersion=UpdateCore.Manifest(target)["version"]!.GetValue<string>()};UpdateCore.AtomicJson(Program.Settings,c);Program.Register(c);}
  Clipboard.SetText(target);var psi=new ProcessStartInfo(Program.FindChrome()){UseShellExecute=false};if(chosen!=null)psi.ArgumentList.Add("--profile-directory="+chosen.profile);psi.ArgumentList.Add("chrome://extensions");Process.Start(psi);
  message.Text=chosen!=null?"준비했습니다. 기존 작업 자료는 유지했습니다.\n\n열린 Chrome 확장 관리에서 비전 카드의 새로고침(↻)을 한 번 누르고, 권한 확인이 나오면 확인해주세요.\n\n처음 연결할 때만 필요한 단계입니다. 다음부터 바탕화면 ‘비전 어시스트’로 실행하고 프로그램 안에서 업데이트합니다.":"Chrome에서 처음 한 번 연결해주세요.\n\n① 확장 관리 오른쪽 위 ‘개발자 모드’ 켜기\n② ‘압축해제된 확장 프로그램을 로드합니다’ 선택\n③ 폴더 경로 칸에 붙여넣기(Ctrl+V)\n\n연결할 폴더 경로를 클립보드에 복사했습니다.\n완료하면 아래 ‘연결 확인하고 시작’을 누르세요.";finish.Visible=true;
 }catch(Exception ex){message.Text=ex.Message;install.Enabled=true;}}
 void Finish(object? sender,EventArgs e){try{
  var matches=Program.Discover().Where(c=>string.Equals(Path.GetFullPath(c.target),Path.GetFullPath(target!),StringComparison.OrdinalIgnoreCase)).ToList();
  if(matches.Count!=1){message.Text="연결한 확장을 아직 확인하지 못했거나 여러 프로필에 연결돼 있습니다. 선택한 Chrome 프로필에서 확장 등록을 확인한 후 다시 눌러주세요.";return;}
  var c=matches[0];UpdateCore.AtomicJson(Program.Settings,c);Program.Register(c);Program.Open(c);Close();
 }catch(Exception ex){message.Text=ex.Message;}}
}
