$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    python tools/package.py
    if ($LASTEXITCODE -ne 0) { throw '패키지 생성에 실패했습니다.' }
    dotnet publish host/VisionAssist.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o artifacts/windows
    if ($LASTEXITCODE -ne 0) { throw '실행 파일 빌드에 실패했습니다.' }
    Copy-Item artifacts/windows/VisionAssist.exe 'artifacts/비전 어시스트.exe' -Force
} finally { Pop-Location }
