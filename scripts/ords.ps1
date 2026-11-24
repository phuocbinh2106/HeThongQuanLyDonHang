<#
  Chạy ORDS (Oracle REST Data Services) trong Docker, cạnh container Oracle của đồ án.

  .\scripts\ords.ps1 start    # lần đầu: cài ORDS vào PDB ecom (vài phút), các lần sau chỉ khởi động
  .\scripts\ords.ps1 status   # trạng thái + thử gọi http://localhost:8181/ords/ecom/order_dv/1
  .\scripts\ords.ps1 stop     # dừng container ORDS (không ảnh hưởng Oracle và web)

  Sau khi ORDS chạy lần đầu, bật AutoREST:  .\scripts\db.ps1 file 11_ords_autorest.sql

  Mật khẩu:
  - SYS: đọc lúc chạy từ ORACLE_PWD trong file .env (không đưa lên git), không có thì từ biến của container Oracle.
  - ORDS_PUBLIC_USER (user ORDS dùng để kết nối): tự sinh ngẫu nhiên lần đầu, ORDS lưu trong volume cấu hình.
  Cả hai được truyền cho container qua thư mục secrets tạm trong %TEMP% và xoá ngay sau khi container khởi động xong.
#>
param([ValidateSet('start', 'stop', 'status')][string]$Action = 'status')
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $repo '.env'
$oracle = 'oracle23ai'
if (Test-Path $envFile) {
  $line = Get-Content $envFile | Where-Object { $_ -match '^\s*ORACLE_CONTAINER\s*=' } | Select-Object -First 1
  if ($line) { $oracle = ($line -split '=', 2)[1].Trim() }
}
$name = 'ords'
$image = 'container-registry.oracle.com/database/ords:latest'
$url = 'http://localhost:8181/ords/ecom/order_dv/1'

function Test-Ords {
  try { $r = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 5; return $r.StatusCode } catch {
    if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode } return $null }
}

switch ($Action) {
  'status' {
    docker ps -a --filter "name=^$name$" --format '{{.Names}}  {{.Status}}  {{.Ports}}'
    $code = Test-Ords
    if ($code) { "GET $url -> HTTP $code (404 = ORDS chạy nhưng chưa bật AutoREST: chạy db.ps1 file 11_ords_autorest.sql)" }
    else { "ORDS chưa trả lời ở cổng 8181." }
  }
  'stop' { docker stop $name | Out-Null; 'Đã dừng ORDS.' }
  'start' {
    $exists = docker ps -a --filter "name=^$name$" --format '{{.Names}}'
    if ($exists) {
      docker start $name | Out-Null
      'Đã khởi động lại container ORDS có sẵn.'
    } else {
      # Lần đầu: cần mật khẩu SYS để ORDS tự cài schema ORDS_METADATA vào PDB ecom
      # Ưu tiên ORACLE_PWD trong .env (mật khẩu hiện tại, kể cả khi đã đổi sau khi tạo container);
      # không có .env thì dùng biến môi trường lúc tạo container.
      $sysPwd = $null
      if (Test-Path $envFile) {
        $l = Get-Content $envFile | Where-Object { $_ -match '^\s*ORACLE_PWD\s*=' } | Select-Object -First 1
        if ($l) { $sysPwd = ($l -split '=', 2)[1].Trim() }
      }
      if (-not $sysPwd) { $sysPwd = (docker exec $oracle bash -c 'echo -n $ORACLE_PWD') }
      if (-not $sysPwd) { throw "Không có ORACLE_PWD (trong .env hoặc container $oracle)." }
      # Gọi thẳng "ords install" (không qua script khởi động của image: script đó ghép mật khẩu vào chuỗi
      # sys/<mật khẩu>@host nên hỏng khi mật khẩu có ký tự @ hoặc /). Mật khẩu đưa qua stdin (--password-stdin):
      # dòng 1 = mật khẩu SYS, dòng 2 = mật khẩu mới cho ORDS_PUBLIC_USER. Tệp tạm bị xoá ngay sau khi cài.
      $userPwd = 'Ords' + (-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 16 | ForEach-Object { [char]$_ }))
      $stdinTmp = Join-Path $env:TEMP 'ords_install_stdin.txt'
      [IO.File]::WriteAllText($stdinTmp, "$sysPwd`n$userPwd`n", (New-Object Text.UTF8Encoding $false))
      try {
        'Đang cài ORDS vào PDB ecom (lần đầu vài phút)...'
        # cmd "<" để đưa tệp vào stdin (PowerShell 5.1 pipe sang lệnh ngoài sẽ chèn BOM)
        cmd /c "docker run --rm -i -v ords-config:/etc/ords/config --entrypoint /opt/oracle/ords/bin/ords $image --config /etc/ords/config install --admin-user ""SYS AS SYSDBA"" --proxy-user --db-hostname host.docker.internal --db-port 1521 --db-servicename ecom --feature-sdw false --log-folder /tmp --password-stdin < ""$stdinTmp"" 2>&1" |
          Select-Object -Last 6
        if ($LASTEXITCODE -ne 0) { throw "ords install lỗi (mã $LASTEXITCODE)." }
      } finally {
        Remove-Item $stdinTmp -Force -ErrorAction SilentlyContinue
      }
      # Mặc định ORDS giấu lỗi CSDL sau thông báo chung "ORDS-25001 Bad Request". Bật in chi tiết để demo thấy
      # đúng nguyên nhân (ví dụ ORA-20001 hết hàng do trigger). CHỈ dùng trên máy cá nhân, không dùng khi triển khai thật.
      docker run --rm -v ords-config:/etc/ords/config --entrypoint /opt/oracle/ords/bin/ords $image `
        --config /etc/ords/config config set debug.printDebugToScreen true | Out-Null
      # Container phục vụ: chỉ dùng cấu hình đã lưu trong volume ords-config (mật khẩu ORDS_PUBLIC_USER nằm trong ví mã hoá của ORDS)
      docker run -d --name $name -p 8181:8080 -v ords-config:/etc/ords/config --restart unless-stopped `
        --entrypoint /opt/oracle/ords/bin/ords $image --config /etc/ords/config serve | Out-Null
      'Đã cài xong, khởi động ORDS với cấu hình đã lưu.'
    }
    for ($i = 0; $i -lt 30 -and -not (Test-Ords); $i++) { Start-Sleep 3 }
    "ORDS trả lời: HTTP $(Test-Ords) tại $url"
  }
}
