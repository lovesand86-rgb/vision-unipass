using VisionAssist;using System.IO.Compression;using System.Text.Json;
var root=Path.Combine(Path.GetTempPath(),"vision-core-test-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);int passed=0;
void Check(bool c,string name){if(!c)throw new Exception(name);passed++;Console.WriteLine("PASS "+name);}
void Reject(Action a,string name){try{a();}catch{Check(true,name);return;}throw new Exception("Expected rejection: "+name);}
try{
 var stage=Path.Combine(root,"source");var target=Path.Combine(root,"target");var state=Path.Combine(root,"state");Directory.CreateDirectory(stage);Directory.CreateDirectory(target);Directory.CreateDirectory(state);
 foreach(var f in UpdateCore.Required)File.WriteAllText(Path.Combine(stage,f),f=="manifest.json"?"{\"name\":\"비전 어시스트\",\"manifest_version\":3,\"version\":\"1.1.0\"}":"// synthetic file");
 File.WriteAllText(Path.Combine(target,"manifest.json"),"{\"name\":\"비전 UNI-PASS 입력칸 확인\",\"manifest_version\":3,\"version\":\"0.9.0\",\"key\":\"preserve-id\"}");File.WriteAllText(Path.Combine(target,"cargo-target.js"),"private synthetic cargo");File.WriteAllText(Path.Combine(target,"assist.js"),"old code");
 var zip=Path.Combine(root,"release.zip");ZipFile.CreateFromDirectory(stage,zip);var feed=new Feed("vision-extension-update",1,"1.1.0",1,"https://github.com/lovesand86-rgb/vision-unipass/releases/download/v1.1.0/vision-extension-core.zip",UpdateCore.Hash(zip),new FileInfo(zip).Length,Directory.GetFiles(stage).Select(p=>new ReleaseFile(Path.GetFileName(p),UpdateCore.Hash(p),new FileInfo(p).Length)).ToList());
 UpdateCore.Validate(feed);Check(true,"valid feed");
 Reject(()=>UpdateCore.Validate(feed with{url="https://example.com/file.zip"}),"reject foreign release");Reject(()=>UpdateCore.Validate(feed with{files=feed.files.Append(new("../evil.js",new string('a',64),1)).ToList()}),"reject traversal");Reject(()=>UpdateCore.Validate(feed with{files=feed.files.Append(new("cargo-target.js",new string('a',64),1)).ToList()}),"protect private cargo");Reject(()=>UpdateCore.Validate(feed with{files=feed.files.Append(feed.files[0]).ToList()}),"reject duplicate files");
 Reject(()=>UpdateCore.Expand(feed with{sha256=new string('a',64)},zip,Path.Combine(root,"bad")),"reject corrupted archive");
 var bytes=File.ReadAllBytes(zip);
 for(int i=0;i<bytes.Length-46;i++){
  if(BitConverter.ToUInt32(bytes,i)==0x04034b50){int len=BitConverter.ToUInt16(bytes,i+26);if(i+30+len<=bytes.Length&&System.Text.Encoding.UTF8.GetString(bytes,i+30,len)=="assist.js")Array.Copy(BitConverter.GetBytes(1),0,bytes,i+22,4);}
  if(BitConverter.ToUInt32(bytes,i)==0x02014b50){int len=BitConverter.ToUInt16(bytes,i+28);if(i+46+len<=bytes.Length&&System.Text.Encoding.UTF8.GetString(bytes,i+46,len)=="assist.js")Array.Copy(BitConverter.GetBytes(1),0,bytes,i+24,4);}
 }
 var oversized=Path.Combine(root,"oversized.zip");File.WriteAllBytes(oversized,bytes);
 var deceptive=feed with{sha256=UpdateCore.Hash(oversized),files=feed.files.Select(x=>x.path=="assist.js"?x with{size=1}:x).ToList()};
 Reject(()=>UpdateCore.Expand(deceptive,oversized,Path.Combine(root,"oversized-stage")),"enforce decompressed byte limit");
 var expanded=Path.Combine(root,"expanded");UpdateCore.Expand(feed,zip,expanded);Check(File.Exists(Path.Combine(expanded,"assist.js")),"verified extraction");
 Reject(()=>UpdateCore.Install(feed,expanded,target,state,n=>{if(n==2)throw new Exception("simulated power failure");}),"injected application failure");Check(File.ReadAllText(Path.Combine(target,"assist.js"))=="old code","rollback preserved previous code");Check(!File.Exists(Path.Combine(state,"pending.json")),"rollback closed journal");Check(!File.Exists(Path.Combine(target,"assist.html")),"rollback removed new files");
 UpdateCore.Install(feed,expanded,target,state);Check(UpdateCore.Manifest(target)["version"]!.GetValue<string>()=="1.1.0","update version applied");Check(UpdateCore.Manifest(target)["key"]!.GetValue<string>()=="preserve-id","extension identity preserved");Check(File.ReadAllText(Path.Combine(target,"cargo-target.js"))=="private synthetic cargo","private cargo unchanged");
 var journal=JsonSerializer.Deserialize<Journal>(File.ReadAllText(Path.Combine(state,"last-update.json")))!;UpdateCore.AtomicJson(Path.Combine(state,"pending.json"),journal);UpdateCore.Recover(target,state);Check(File.ReadAllText(Path.Combine(target,"assist.js"))=="old code","pending recovery");
 Reject(()=>UpdateCore.Restore(journal with{target=root},target,state),"recovery target mismatch");File.WriteAllText(Path.Combine(journal.backup,"assist.js"),"corrupted backup");Reject(()=>UpdateCore.Restore(journal,target,state),"corrupted backup refused before write");
 Console.WriteLine($"{passed} checks passed");
}finally{Directory.Delete(root,true);}
