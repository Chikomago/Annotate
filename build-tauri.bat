@echo off

cd /d "%~dp0"

set PIP_INDEX=https://pypi.tuna.tsinghua.edu.cn/simple
set RESOURCE_DIR=src-tauri\resources
set VENV_DIR=venv-tauri-win
set RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-msvc

REM Use local disk for Cargo build (shared folder causes os error 87)
set CARGO_BUILD_TARGET_DIR=C:\Users\A\annotate-target

echo.
echo ============================================
echo    Annotate - Tauri Build Script (Windows)
echo ============================================
echo.

echo [INFO] Checking Python...
python --version
if %errorlevel% neq 0 (
    echo [ERROR] Python not found
    pause
    exit /b 1
)
python -c "import platform; print('[INFO] Python arch: ' + platform.machine())"
echo.

REM -- Step 1: Prepare Python venv --
if exist "%VENV_DIR%\Scripts\python.exe" (
    echo [INFO] Venv exists, checking dependencies
) else (
    if exist "%VENV_DIR%" rmdir /s /q "%VENV_DIR%"
    echo [INFO] Creating venv...
    python -m venv "%VENV_DIR%"
    echo [INFO] Upgrading pip...
    "%VENV_DIR%\Scripts\python.exe" -m pip install --upgrade pip -i "%PIP_INDEX%"
)

echo [INFO] Installing Python dependencies...
call "%VENV_DIR%\Scripts\activate.bat"
pip install -i "%PIP_INDEX%" -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies
    call deactivate
    pause
    exit /b 1
)
call deactivate

echo [OK] Python environment ready
echo.

REM -- Step 2: Assemble resources --
echo [INFO] Assembling resources...

if exist "%RESOURCE_DIR%" rmdir /s /q "%RESOURCE_DIR%"
mkdir "%RESOURCE_DIR%\python"
mkdir "%RESOURCE_DIR%\app"

echo [INFO] Copying Python environment...
xcopy /e /i /q /y "%VENV_DIR%\*" "%RESOURCE_DIR%\python\" >nul

if exist "%RESOURCE_DIR%\python\share" rmdir /s /q "%RESOURCE_DIR%\python\share"

echo [INFO] Copying project files...
copy /y app.py "%RESOURCE_DIR%\app\" >nul
copy /y index.html "%RESOURCE_DIR%\app\" >nul
copy /y template.docx "%RESOURCE_DIR%\app\" >nul
if exist .env copy /y .env "%RESOURCE_DIR%\app\" >nul

echo [INFO] Copying project directories...
for %%d in (api services models js css assets data) do (
    if exist "%%d" (
        echo [INFO] Copying %%d...
        xcopy /e /i /q /y "%%d\*" "%RESOURCE_DIR%\app\%%d\" >nul
    ) else (
        echo [INFO] Skipping %%d
    )
)

echo [OK] Resources assembled
echo.

REM -- Step 3: Tauri build --
echo [INFO] Starting Tauri build...

cd src-tauri

if "%1"=="--dev" (
    cargo build
) else (
    cargo build --release
)

cd ..

if %errorlevel% neq 0 (
    echo [ERROR] Build failed!
    pause
    exit /b 1
)

echo.
echo [OK] Build complete!
echo   Output: C:\Users\A\annotate-target\release\bundle\msi\
echo.
pause
