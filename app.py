# -*- coding: utf-8 -*-
"""
图像标注系统 - Flask后端应用
前后端共用同一端口，Flask同时提供API和静态文件服务
"""
import os
import sys
import socket
import signal
import webbrowser
import threading

# 打印诊断信息
print(f"[Annotate] Python: {sys.executable}", flush=True)
print(f"[Annotate] Version: {sys.version}", flush=True)
print(f"[Annotate] Platform: {sys.platform}", flush=True)
print(f"[Annotate] Frozen: {getattr(sys, 'frozen', False)}", flush=True)
print(f"[Annotate] BASE_PATH: {os.getcwd()}", flush=True)

# 尝试导入依赖
try:
    from flask import Flask, send_from_directory, send_file
    print("[Annotate] Flask imported successfully", flush=True)
except ImportError as e:
    print(f"[Annotate] Flask import FAILED: {e}", flush=True)
    sys.exit(1)

try:
    from flask_cors import CORS
    print("[Annotate] CORS imported successfully", flush=True)
except ImportError as e:
    print(f"[Annotate] CORS import FAILED: {e}", flush=True)
    sys.exit(1)

# 应用端口配置（支持环境变量覆盖）
APP_PORT = int(os.environ.get('ANNOTATE_PORT', 5008))


def kill_port(port):
    """释放占用的端口"""
    if sys.platform == 'darwin' or sys.platform.startswith('linux'):
        import subprocess
        try:
            # 查找占用端口的进程
            result = subprocess.run(
                ['lsof', '-ti', f':{port}'],
                capture_output=True, text=True
            )
            pids = result.stdout.strip().split('\n')
            for pid in pids:
                if pid:
                    os.kill(int(pid), signal.SIGKILL)
        except:
            pass
    elif sys.platform == 'win32':
        import subprocess
        try:
            # Windows 使用 netstat 查找进程
            result = subprocess.run(
                f'netstat -ano | findstr :{port}',
                capture_output=True, text=True, shell=True
            )
            for line in result.stdout.strip().split('\n'):
                if line and 'LISTENING' in line:
                    parts = line.strip().split()
                    if parts:
                        pid = parts[-1]
                        if pid.isdigit():
                            print(f"尝试杀掉进程 {pid} 以释放端口 {port}", flush=True)
                            subprocess.run(f'taskkill /F /PID {pid}', shell=True, capture_output=True)
            
            # 尝试使用PowerShell作为备选方案
            try:
                ps_command = f"Get-Process -Id (Get-NetTCPConnection -LocalPort {port}).OwningProcess | Stop-Process -Force"
                subprocess.run(['powershell', '-Command', ps_command], capture_output=True)
            except:
                pass
        except Exception as e:
            print(f"释放端口时出错: {e}", flush=True)
            pass


def is_port_in_use(port):
    """检查端口是否被占用"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0


def get_base_path():
    """获取应用基础路径，兼容开发环境和打包环境"""
    if getattr(sys, 'frozen', False):
        # 打包后的环境
        exe_path = os.path.realpath(sys.executable)
        bundle_dir = os.path.dirname(exe_path)
        
        # 检查是否在 .app/Contents/MacOS 中 (macOS)
        if bundle_dir.endswith('Contents/MacOS'):
            # .app 包，资源在 Contents/Resources
            return os.path.join(os.path.dirname(bundle_dir), 'Resources')
        
        # Windows: exe 在 release/Annotate.exe, 资源在 release/resources/
        # Python 在 resources/python/Scripts/python.exe
        # 需要回到 release/ 目录
        if 'python' in bundle_dir.lower():
            # Python 路径: .../resources/python/Scripts/python.exe
            # 向上两级回到 resources/
            parent = os.path.dirname(bundle_dir)  # .../resources/python
            grandparent = os.path.dirname(parent)  # .../resources
            great_grandparent = os.path.dirname(grandparent)  # .../
            return grandparent
        
        return bundle_dir
    # 开发环境
    return os.path.dirname(os.path.abspath(__file__))


# 设置工作目录
BASE_PATH = get_base_path()
os.chdir(BASE_PATH)

def create_app(parent_pid=None):
    """创建并配置Flask应用"""
    app = Flask(__name__, static_folder='.')
    
    # 启用CORS支持
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # 父进程监控：如果由 Tauri 启动，在请求前检查父进程是否还活着
    if parent_pid:
        _ppid = int(parent_pid)  # 确保转换为整数
        print(f"[watchdog] Parent PID: {_ppid}", flush=True)

        @app.before_request
        def check_parent_alive():
            try:
                if sys.platform == 'win32':
                    # Windows 特定处理：使用tasklist检查进程是否存在
                    import subprocess
                    result = subprocess.run(
                        f'tasklist /FI "PID eq {_ppid}"',
                        capture_output=True, text=True, shell=True
                    )
                    if f"{_ppid}" not in result.stdout:
                        print("[watchdog] Parent process not found, exiting", flush=True)
                        os._exit(0)
                else:
                    # Unix 系统使用 os.kill
                    os.kill(_ppid, 0)
            except Exception as e:
                # 父进程已死或无法访问，立即退出
                print(f"[watchdog] Parent process check failed: {e}, exiting", flush=True)
                os._exit(0)
    
    # 注册API蓝图
    try:
        from api import projects, upload, export
        from api.statistics import statistics_bp
        app.register_blueprint(projects.bp, url_prefix='/api/projects')
        app.register_blueprint(upload.bp, url_prefix='/api/upload')
        app.register_blueprint(export.bp, url_prefix='/api/export')
        app.register_blueprint(statistics_bp)
        print("[Annotate] API blueprints registered", flush=True)
    except ImportError as e:
        print(f"[Annotate] API import FAILED: {e}", flush=True)
        import traceback
        traceback.print_exc()
        raise
    
    # ============================================
    # 前端静态文件路由
    # ============================================
    
    @app.route('/')
    def serve_index():
        """首页 - 主应用页面"""
        return send_file('index.html')
    
    @app.route('/index.html')
    def serve_main():
        """主应用页面（SPA入口）"""
        return send_file('index.html')
    
    @app.route('/js/<path:filename>')
    def serve_js(filename):
        """JavaScript文件"""
        return send_from_directory('js', filename)
    
    @app.route('/css/<path:filename>')
    def serve_css(filename):
        """CSS文件"""
        return send_from_directory('css', filename)
    
    @app.route('/assets/<path:filename>')
    def serve_assets(filename):
        """静态资源文件"""
        return send_from_directory('assets', filename)
    
    @app.route('/data/<path:filename>')
    def serve_data(filename):
        """数据文件（如导出的文档）"""
        return send_from_directory('data', filename)
    
    @app.route('/api/health')
    def health_check():
        """健康检查端点"""
        return {'status': 'ok', 'port': APP_PORT}
    
    return app

if __name__ == '__main__':
    # 检查端口是否被占用
    port_ready = True
    if is_port_in_use(APP_PORT):
        if getattr(sys, 'frozen', False):
            # 打包环境下自动释放端口
            print(f"⚠️  端口 {APP_PORT} 已被占用，正在尝试释放...", flush=True)
            kill_port(APP_PORT)
            # 等待端口释放
            import time
            time.sleep(0.5)
            # 再次检查
            if is_port_in_use(APP_PORT):
                print(f"""
❌ 端口 {APP_PORT} 自动释放失败

请手动执行以下命令释放端口后重试:

Mac/Linux:
  lsof -ti:{APP_PORT} | xargs kill -9

Windows:
  netstat -ano | findstr :{APP_PORT}
  taskkill /F /PID <进程ID>
""", flush=True)
                input("按回车键退出...")
                port_ready = False
            else:
                print(f"✅ 端口已释放", flush=True)
        else:
            # 开发环境询问用户是否释放端口
            print(f"\n⚠️  端口 {APP_PORT} 已被占用", flush=True)
            try:
                choice = input("是否自动释放端口? (yes / no): ").strip().lower()
                if choice == 'yes' or choice == 'yes':
                    print(f"正在释放端口 {APP_PORT}...", flush=True)
                    kill_port(APP_PORT)
                    import time
                    time.sleep(0.5)
                    if is_port_in_use(APP_PORT):
                        print(f"❌ 端口释放失败，请手动检查", flush=True)
                        port_ready = False
                    else:
                        print(f"✅ 端口已释放", flush=True)
                else:
                    print("已取消启动", flush=True)
                    port_ready = False
            except (KeyboardInterrupt, EOFError):
                print("\n已取消", flush=True)
                port_ready = False
    
    if not port_ready:
        sys.exit(1)
    
    # 父进程监控：如果由 Tauri 启动，传给 create_app 注册 before_request 钩子
    parent_pid = os.environ.get('ANNOTATE_PARENT_PID')
    ppid = int(parent_pid) if parent_pid else None

    if ppid:
        print(f"[watchdog] Parent monitor enabled, PID: {ppid}", flush=True)

    app = create_app(parent_pid=ppid)
    
    # -------------------------------------------------------------------------
    # 启动 Flask 服务
    # -------------------------------------------------------------------------
    # 仅在非 Tauri 环境下自动打开浏览器（Tauri 环境通过启动器手动打开）
    auto_open = os.environ.get('ANNOTATE_NO_AUTO_OPEN', '') != '1'

    def open_browser():
        """延迟打开浏览器"""
        print(f"正在打开浏览器: http://127.0.0.1:{APP_PORT}", flush=True)
        webbrowser.open(f'http://127.0.0.1:{APP_PORT}')

    if auto_open:
        # 在子线程中延迟打开浏览器，确保 Flask 已经启动
        if not getattr(sys, 'frozen', False):
            print(f"正在启动 Flask 服务...", flush=True)
            threading.Timer(1.5, open_browser).start()
        else:
            # 打包环境
            if sys.platform == 'darwin':
                try:
                    from AppKit import NSProcessInfo
                    NSProcessInfo.processInfo().setProcessName_('Annotate')
                except:
                    pass
            threading.Timer(1.5, open_browser).start()
    else:
        if not getattr(sys, 'frozen', False):
            print(f"正在启动 Flask 服务...", flush=True)
        else:
            if sys.platform == 'darwin':
                try:
                    from AppKit import NSProcessInfo
                    NSProcessInfo.processInfo().setProcessName_('Annotate')
                except:
                    pass

    app.run(debug=False, port=APP_PORT, host='127.0.0.1')
