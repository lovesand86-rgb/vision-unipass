using System.IO.Compression;
using System.Net;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
namespace VisionAssist;
public record ReleaseFile(string path,string sha256,long size);
public record Feed(string format,int schema,string version,int updater_min,string url,string sha256,long size,List<ReleaseFile> files);
public record SavedFile(string name,bool existed,string? sha256);
public record Journal(string target,string backup,List<SavedFile> files,string version);
public static class UpdateCore {
 public const string FeedUrl="https://github.com/lovesand86-rgb/vision-unipass/releases/latest/download/update.json";
 public static readonly string[] Required={"manifest.json","assist.html","assist.js","assist-worker.js","cargo-workflow.js"};
 public static string Hash(string file)=>Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(file))).ToLowerInvariant();
 public static void Regular(string path){
  for(var p=new DirectoryInfo(Path.GetDirectoryName(Path.GetFullPath(path))!);p!=null;p=p.Parent)if(p.Exists&&(p.Attributes&FileAttributes.ReparsePoint)!=0)throw new IOException("연결된 폴더에는 설치할 수 없습니다.");
  if(File.Exists(path)||Directory.Exists(path))if((File.GetAttributes(path)&FileAttributes.ReparsePoint)!=0)throw new IOException("연결된 파일은 지원하지 않습니다.");
 }
 public static bool SafeName(string n)=>Regex.IsMatch(n,@"^[a-z][a-z0-9-]*\.(js|json|html|css|svg|png)$")&&!Regex.IsMatch(n,@"^(con|prn|aux|nul|com[0-9]|lpt[0-9])\.",RegexOptions.IgnoreCase)&&n!="cargo-target.js";
 public static JsonObject Manifest(string target){var p=Path.Combine(target,"manifest.json");Regular(p);var m=JsonNode.Parse(File.ReadAllText(p))!.AsObject();if(!new[]{"비전 UNI-PASS 입력칸 확인","비전 어시스트"}.Contains(m["name"]?.GetValue<string>())||m["manifest_version"]?.GetValue<int>()!=3)throw new InvalidDataException("비전 프로그램 폴더가 아닙니다.");return m;}
 public static void Validate(Feed f){
  if(f.format!="vision-extension-update"||f.schema!=1||f.updater_min>1||!Version.TryParse(f.version,out _)||f.size<=0||f.size>16777216||!Regex.IsMatch(f.sha256,@"^[a-f0-9]{64}$"))throw new InvalidDataException("업데이트 정보 형식이 올바르지 않습니다.");
  if(!Uri.TryCreate(f.url,UriKind.Absolute,out var u)||u.Scheme!="https"||u.Host!="github.com"||u.Port!=443||u.UserInfo!=""||u.Query!=""||u.Fragment!=""||!Regex.IsMatch(u.AbsolutePath,@"^/lovesand86-rgb/vision-unipass/releases/download/[^/]+/vision-extension-core\.zip$"))throw new InvalidDataException("허용된 배포 주소가 아닙니다.");
  if(f.files==null||f.files.Count<5||f.files.Count>150||f.files.Select(x=>x.path).Distinct(StringComparer.OrdinalIgnoreCase).Count()!=f.files.Count||f.files.Any(x=>!SafeName(x.path)||!Regex.IsMatch(x.sha256,@"^[a-f0-9]{64}$")||x.size<0||x.size>4194304)||f.files.Sum(x=>x.size)>33554432||Required.Any(n=>!f.files.Any(x=>x.path==n)))throw new InvalidDataException("업데이트 파일 목록을 확인할 수 없습니다.");
 }
 public static void AtomicJson<T>(string path,T obj){Regular(path);var tmp=path+".new";Regular(tmp);File.WriteAllText(tmp,JsonSerializer.Serialize(obj));File.Move(tmp,path,true);}
 public static async Task Download(string url,string path,long max){
  using var handler=new HttpClientHandler{AllowAutoRedirect=false};using var client=new HttpClient(handler){Timeout=TimeSpan.FromSeconds(45)};client.DefaultRequestHeaders.UserAgent.ParseAdd("VisionAssist/1.0");
  for(int i=0;i<6;i++){
   var u=new Uri(url);if(u.Scheme!="https"||u.Port!=443||u.UserInfo!=""||!new[]{"github.com","api.github.com","release-assets.githubusercontent.com","objects.githubusercontent.com"}.Contains(u.Host))throw new IOException("허용되지 않은 다운로드 주소입니다.");
   using var response=await client.GetAsync(u,HttpCompletionOption.ResponseHeadersRead);
   if((int)response.StatusCode is 301 or 302 or 303 or 307 or 308){url=new Uri(u,response.Headers.Location??throw new IOException("다운로드 주소를 확인하지 못했습니다.")).ToString();continue;}
   if(response.StatusCode==HttpStatusCode.NotFound)throw new FileNotFoundException("아직 받을 수 있는 업데이트가 게시되지 않았습니다. 현재 프로그램은 계속 사용할 수 있습니다.");
   response.EnsureSuccessStatusCode();if(response.Content.Headers.ContentLength>max)throw new IOException("업데이트 파일 크기가 제한을 넘습니다.");
   using var timeout=new CancellationTokenSource(TimeSpan.FromMinutes(2));await using var input=await response.Content.ReadAsStreamAsync(timeout.Token);await using var output=File.Create(path);var buffer=new byte[65536];long total=0;int count;
   while((count=await input.ReadAsync(buffer,timeout.Token))>0){total+=count;if(total>max)throw new IOException("다운로드 크기가 제한을 넘습니다.");await output.WriteAsync(buffer.AsMemory(0,count),timeout.Token);}return;
  }
  throw new IOException("다운로드 이동 횟수가 너무 많습니다.");
 }
 public static async Task<Feed> FetchFeed(string temp){var p=Path.Combine(temp,"update.json");await Download(FeedUrl,p,524288);var feed=JsonSerializer.Deserialize<Feed>(File.ReadAllText(p))??throw new InvalidDataException("업데이트 정보가 없습니다.");Validate(feed);return feed;}
 public static void Expand(Feed f,string zip,string stage){
  Validate(f);if(new FileInfo(zip).Length!=f.size||Hash(zip)!=f.sha256)throw new InvalidDataException("다운로드 파일 검증에 실패했습니다. 설치 파일은 바꾸지 않았습니다.");
  using var archive=ZipFile.OpenRead(zip);if(archive.Entries.Count!=f.files.Count)throw new InvalidDataException("예상하지 않은 압축 항목입니다.");
  var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
  foreach(var e in archive.Entries){var expected=f.files.SingleOrDefault(x=>x.path==e.FullName);if(expected==null||!seen.Add(e.FullName)||e.Length!=expected.size||((e.ExternalAttributes>>16)&61440)==40960)throw new InvalidDataException("압축 경로나 파일 크기가 올바르지 않습니다.");}
  Directory.CreateDirectory(stage);
  foreach(var e in archive.Entries){
   var p=Path.Combine(stage,e.FullName);var expected=f.files.Single(x=>x.path==e.FullName);
   using(var input=e.Open())using(var output=File.Create(p)){
    var buffer=new byte[65536];long written=0;int count;
    while((count=input.Read(buffer))>0){written+=count;if(written>expected.size)throw new InvalidDataException("압축 해제 크기가 선언된 제한을 넘습니다.");output.Write(buffer,0,count);}
    if(written!=expected.size)throw new InvalidDataException("압축 해제 크기가 일치하지 않습니다.");
   }
   if(Hash(p)!=expected.sha256)throw new InvalidDataException("압축 해제한 파일 검증에 실패했습니다.");
  }
  var m=Manifest(stage);if(m["version"]?.GetValue<string>()!=f.version)throw new InvalidDataException("버전 정보가 일치하지 않습니다.");
 }
 static void Put(string src,string dst){Regular(dst);Regular(src);var tmp=dst+".vision-new";Regular(tmp);File.Copy(src,tmp,true);File.Move(tmp,dst,true);}
 public static void Install(Feed f,string stage,string target,string state,Action<int>? fault=null){
  Validate(f);var old=Manifest(target);Regular(target);if(!File.Exists(Path.Combine(target,"cargo-target.js")))throw new IOException("기존 작업 설정 파일이 없습니다.");
  var privateHash=Hash(Path.Combine(target,"cargo-target.js"));var pending=Path.Combine(state,"pending.json");if(File.Exists(pending))throw new IOException("중단된 업데이트를 먼저 복구해야 합니다.");
  var backup=Path.Combine(state,"backups",Guid.NewGuid().ToString("N"));Directory.CreateDirectory(backup);var saved=new List<SavedFile>();
  foreach(var file in f.files){var src=Path.Combine(stage,file.path);var dst=Path.Combine(target,file.path);Regular(src);Regular(dst);if(Hash(src)!=file.sha256)throw new InvalidDataException("설치 대기 파일이 변경됐습니다.");if(Directory.Exists(dst))throw new IOException("같은 이름의 폴더가 있습니다.");var exists=File.Exists(dst);var hash=exists?Hash(dst):null;if(exists){File.Copy(dst,Path.Combine(backup,file.path));if(Hash(Path.Combine(backup,file.path))!=hash)throw new IOException("백업 검증에 실패했습니다.");}saved.Add(new(file.path,exists,hash));}
  var journal=new Journal(Path.GetFullPath(target),backup,saved,f.version);AtomicJson(pending,journal);
  try{
   int n=0;foreach(var file in f.files){Put(Path.Combine(stage,file.path),Path.Combine(target,file.path));fault?.Invoke(++n);}
   foreach(var file in f.files)if(Hash(Path.Combine(target,file.path))!=file.sha256)throw new IOException("적용 후 파일 검증에 실패했습니다.");
   // The unpacked extension's identity and Chrome storage must remain unchanged.
   var updated=Manifest(target);if(old["key"]!=null)updated["key"]=old["key"]!.DeepClone();else updated.Remove("key");AtomicJson(Path.Combine(target,"manifest.json"),updated);
   if(Hash(Path.Combine(target,"cargo-target.js"))!=privateHash)throw new IOException("작업 설정이 변경됐습니다.");
   AtomicJson(Path.Combine(state,"last-update.json"),journal);File.Delete(pending);
  }catch{Restore(journal,target,state);File.Delete(pending);throw;}
 }
 public static void Restore(Journal j,string expectedTarget,string state){
  if(Path.GetFullPath(j.target)!=Path.GetFullPath(expectedTarget)||!Path.GetFullPath(j.backup).StartsWith(Path.GetFullPath(Path.Combine(state,"backups"))+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||j.files.Count>150||j.files.Select(x=>x.name).Distinct(StringComparer.OrdinalIgnoreCase).Count()!=j.files.Count)throw new IOException("복구 기록의 경로가 올바르지 않습니다.");
  foreach(var f in j.files){if(!SafeName(f.name))throw new IOException("복구 파일 이름이 올바르지 않습니다.");Regular(Path.Combine(j.target,f.name));if(f.existed){var b=Path.Combine(j.backup,f.name);Regular(b);if(Hash(b)!=f.sha256)throw new IOException("복구 백업 검증에 실패했습니다.");}}
  foreach(var f in j.files){var dst=Path.Combine(j.target,f.name);if(f.existed)Put(Path.Combine(j.backup,f.name),dst);else if(File.Exists(dst))File.Delete(dst);}
 }
 public static void Recover(string target,string state){var p=Path.Combine(state,"pending.json");if(!File.Exists(p))return;var j=JsonSerializer.Deserialize<Journal>(File.ReadAllText(p))!;Restore(j,target,state);File.Delete(p);}
}
