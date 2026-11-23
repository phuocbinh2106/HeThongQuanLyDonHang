<#
.SYNOPSIS
  Chạy các script SQL của đồ án bằng SQL*Plus nằm SẴN trong container Oracle (không cần cài
  Oracle Client trên Windows).

.EXAMPLE
  .\scripts\db.ps1 install      # xoá sạch schema và cài lại 01..08 (cấu trúc + dữ liệu mẫu)
  .\scripts\db.ps1 reset        # chỉ đưa DỮ LIỆU về ban đầu (t00_reset.sql)
  .\scripts\db.ps1 test         # chạy kiểm thử mức CSDL (t01 + t02), in PASS/FAIL
  .\scripts\db.ps1 setup-pdb    # (chỉ lần đầu, máy mới) tạo PDB ecom + user ecom_schema bằng SYS
  .\scripts\db.ps1 file t02_test_cases.sql   # chạy một file bất kỳ trong thư mục sql/

.NOTES
  Biến môi trường (hoặc file .env ở thư mục gốc repo):
    ORACLE_CONTAINER   tên container Oracle   (mặc định: oracle23ai)
    ECOM_DB_PASSWORD   mật khẩu ecom_schema   (mặc định: oracle)
#>
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet('install', 'reset', 'test', 'setup-pdb', 'file')]
  [string]$Action,
  [Parameter(Position = 1)]
  [string]$File
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

# Đọc .env (dạng KEY=VALUE) nếu có, không ghi đè biến môi trường đã đặt sẵn
$envFile = Join-Path $repo '.env'
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$' -and -not (Test-Path "env:$($Matches[1])")) {
      Set-Item -Path "env:$($Matches[1])" -Value $Matches[2]
    }
  }
}
$container = if ($env:ORACLE_CONTAINER) { $env:ORACLE_CONTAINER } else { 'oracle23ai' }
$dbPass    = if ($env:ECOM_DB_PASSWORD) { $env:ECOM_DB_PASSWORD } else { 'oracle' }

# 1) Chép thư mục sql/ vào container (/tmp/ecom_sql)
docker exec -u root $container rm -rf /tmp/ecom_sql | Out-Null
docker cp (Join-Path $repo 'sql') "${container}:/tmp/ecom_sql" | Out-Null
docker exec -u root $container chmod -R a+rwX /tmp/ecom_sql | Out-Null

# 2) Chọn file chạy
switch ($Action) {
  'install'   { $script = 'install_all.sql' }
  'reset'     { $script = 't00_reset.sql' }
  'test'      { $script = 't01_smoke_test.sql' }
  'setup-pdb' { $script = '00_setup_pdb.sql' }
  'file'      { if (-not $File) { throw 'Thiếu tên file. Ví dụ: .\scripts\db.ps1 file t02_test_cases.sql' }; $script = $File }
}

# 3) Tạo file điều khiển _run.sql (ghi ra file rồi chép vào container, vì pipe chuỗi từ
#    PowerShell 5.1 sang docker bị chèn ký tự BOM vào đầu -> SQL*Plus báo SP2-0734)
switch ($Action) {
  'setup-pdb' { $cmd = "set echo on`nwhenever sqlerror exit sql.sqlcode`n@$script`nexit`n" }
  'test'      { $cmd = "set lines 250 pages 200 long 100000 longchunksize 100000`n@t01_smoke_test.sql`n@t02_test_cases.sql`nexit`n" }
  default     { $cmd = "set lines 250 pages 200`nwhenever sqlerror exit sql.sqlcode`n@$script`nexit`n" }
}
$tmp = Join-Path $env:TEMP 'ecom_run.sql'
[IO.File]::WriteAllText($tmp, $cmd, (New-Object Text.UTF8Encoding $false))
docker cp $tmp "${container}:/tmp/ecom_sql/_run.sql" | Out-Null
docker exec -u root $container chmod a+r /tmp/ecom_sql/_run.sql | Out-Null
Remove-Item $tmp

# 4) Gọi sqlplus trong container. NLS_LANG=...AL32UTF8 để tiếng Việt không bị lỗi font.
$conn = if ($Action -eq 'setup-pdb') { '/ as sysdba' } else { "ecom_schema/$dbPass@localhost:1521/ecom" }
docker exec -w /tmp/ecom_sql -e NLS_LANG=AMERICAN_AMERICA.AL32UTF8 $container sqlplus -s -L $conn '@_run.sql'
if ($LASTEXITCODE -ne 0) { Write-Error "SQL*Plus kết thúc với mã lỗi $LASTEXITCODE" }

# 5) install / reset: xoá ảnh sản phẩm người bán đã tải lên (đặt tên theo mã sản phẩm, mà mã
#    sản phẩm được đánh lại từ đầu sau khi reset). Ảnh mẫu trong wwwroot/img giữ nguyên.
if ($Action -in 'install', 'reset') {
  $uploads = Join-Path $repo 'src\Ecom.Web\App_Data\uploads\products'
  if (Test-Path $uploads) { Get-ChildItem $uploads -File | Remove-Item -Force; 'Đã xoá ảnh sản phẩm tải lên (App_Data/uploads/products).' }
}
