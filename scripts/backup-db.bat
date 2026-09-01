@echo off
REM mental-reps Postgres backup script
REM Run this via Windows Task Scheduler (see README section below for setup).
REM Later: change BACKUP_DIR to a mapped QNAP NAS drive letter once that's set up.

setlocal
set BACKUP_DIR=C:\mentalreps-backups
set CONTAINER_NAME=mentalreps-db
set DB_NAME=mentalreps
set DB_USER=postgres

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

for /f "tokens=1-4 delims=/ " %%a in ('date /t') do set DATESTAMP=%%c-%%a-%%b
set TIMESTAMP=%DATESTAMP%_%time:~0,2%%time:~3,2%
set TIMESTAMP=%TIMESTAMP: =0%

docker exec %CONTAINER_NAME% pg_dump -U %DB_USER% %DB_NAME% > "%BACKUP_DIR%\mentalreps_%TIMESTAMP%.sql"

REM Keep only the last 30 backups so this folder doesn't grow forever
forfiles /p "%BACKUP_DIR%" /m mentalreps_*.sql /d -30 /c "cmd /c del @path" 2>nul

endlocal
