@echo off
REM SeaweedFS dev (single process): master + volume + filer + S3 gateway
REM S3 gateway: http://127.0.0.1:8333 (access/secret key: demo/demo)
REM Data dir: D:\Lucky\weed_strorage
set WEED=D:\Lucky\weed_strorage\weed.exe
set DATA=D:\Lucky\weed_strorage\data
REM S3 credential config (identities demo/demo) — override via S3CONFIG env bila checkout di path lain
if not defined S3CONFIG set S3CONFIG=D:\Lucky\NgodingCuy\REAL_PROJECT\ai_accounting\s3config.json
if not exist %DATA% mkdir %DATA%
echo Starting SeaweedFS (master+volume+filer+s3)...
%WEED% server -dir=%DATA% -master.port=9333 -volume.port=8080 -filer.port=8888 -s3 -s3.port=8333 -s3.config="%S3CONFIG%" -master.peers=none -volume.max=256
