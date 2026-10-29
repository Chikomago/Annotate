#!/bin/bash

# ============================================
# Annotate - Tauri 构建脚本 (macOS)
# 把 Python 环境和项目文件打包进 Tauri .app
# ============================================

cd "$(dirname "$0")"
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

PIP_INDEX="https://pypi.tuna.tsinghua.edu.cn/simple"
RESOURCE_DIR="src-tauri/resources"
VENV_DIR="venv-tauri"
STANDALONE_PYTHON="${ANNOTATE_STANDALONE_PYTHON:-/Users/alan/git_project/src-tauri/python}"

print_info() { echo -e "${BLUE}[信息]${NC} $1"; }
print_success() { echo -e "${GREEN}[成功]${NC} $1"; }
print_error() { echo -e "${RED}[错误]${NC} $1"; }

# ── Step 1: 准备 Python 虚拟环境 ──────────────────────────
prepare_venv() {
    if [ -x "$STANDALONE_PYTHON/bin/python3" ] && [ -d "$VENV_DIR/lib/python3.10/site-packages/flask" ]; then
        print_info "使用已有 Python 依赖和独立 Python 运行时"
        return
    fi
    print_info "检查 Python 环境..."

    local current_py=$(which python3)
    if [[ "$current_py" == "/usr/bin/python3" ]]; then
        local candidates=(
            "/opt/homebrew/bin/python3.12"
            "/opt/homebrew/bin/python3.11"
            "/opt/homebrew/bin/python3.10"
            "/usr/local/bin/python3.12"
            "/usr/local/bin/python3.11"
        )
        for py in "${candidates[@]}"; do
            if [ -x "$py" ]; then
                current_py="$py"
                break
            fi
        done
    fi

    print_info "使用 Python: $current_py"

    # 检查是否需要重建 venv
    if [ -d "$VENV_DIR" ]; then
        if [ -f "$VENV_DIR/bin/python" ]; then
            VENV_VER=$("$VENV_DIR/bin/python" --version 2>&1 | awk '{print $2}')
            SYS_VER=$("$current_py" --version 2>&1 | awk '{print $2}')
            if [ "$VENV_VER" != "$SYS_VER" ]; then
                print_info "Python 版本不匹配，重建虚拟环境..."
                rm -rf "$VENV_DIR"
            fi
        else
            rm -rf "$VENV_DIR"
        fi
    fi

    if [ ! -d "$VENV_DIR" ]; then
        print_info "创建虚拟环境..."
        "$current_py" -m venv "$VENV_DIR"
    fi

    source "$VENV_DIR/bin/activate"
    print_info "安装 Python 依赖..."
    pip install -q -i "$PIP_INDEX" -r requirements.txt
    deactivate

    print_success "Python 环境准备完成"
}

# ── Step 2: 组装资源目录 ──────────────────────────────────
assemble_resources() {
    print_info "组装资源目录..."

    rm -rf "$RESOURCE_DIR"
    mkdir -p "$RESOURCE_DIR/python"
    mkdir -p "$RESOURCE_DIR/app"

    # 复制 Python 环境（去掉不必要的文件减小体积）
    print_info "复制 Python 环境..."
    if [ ! -x "$STANDALONE_PYTHON/bin/python3" ]; then
        print_error "缺少独立 Python 运行时: $STANDALONE_PYTHON（可设置 ANNOTATE_STANDALONE_PYTHON）"
        exit 1
    fi
    cp -R "$STANDALONE_PYTHON/" "$RESOURCE_DIR/python/"
    cp -R "$VENV_DIR/lib/python3.10/site-packages/." "$RESOURCE_DIR/python/lib/python3.10/site-packages/"
    rm -rf "$RESOURCE_DIR/python/lib/python3.10/site-packages/cv2"
    rm -rf "$RESOURCE_DIR/python/lib/python3.10/site-packages/opencv_python-"*.dist-info
    "$RESOURCE_DIR/python/bin/python3" -c 'import flask, numpy, docx, psd_tools, PIL; import importlib.util; assert importlib.util.find_spec("cv2") is None' || {
        print_error "打包的 Python 依赖无法加载"
        exit 1
    }
    # 清理 venv 中不需要的文件
    rm -rf "$RESOURCE_DIR/python/share"
    find "$RESOURCE_DIR/python" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
    find "$RESOURCE_DIR/python" -name "*.pyc" -delete 2>/dev/null || true
    find "$RESOURCE_DIR/python" -name "tests" -type d -exec rm -rf {} + 2>/dev/null || true
    find "$RESOURCE_DIR/python" -name "test" -type d -exec rm -rf {} + 2>/dev/null || true

    # 复制 Flask 项目文件
    print_info "复制项目文件..."
    cp app.py "$RESOURCE_DIR/app/"
    cp index.html "$RESOURCE_DIR/app/"
    cp template.docx "$RESOURCE_DIR/app/"

    # 复制项目目录
    for dir in api services models js css assets data; do
        if [ -d "$dir" ]; then
            cp -R "$dir" "$RESOURCE_DIR/app/"
            # 清理 pyc 缓存
            find "$RESOURCE_DIR/app/$dir" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
            find "$RESOURCE_DIR/app/$dir" -name "*.pyc" -delete 2>/dev/null || true
        fi
    done
    # 开发环境的项目图像是用户数据，不应被打进安装包。
    rm -rf "$RESOURCE_DIR/app/data/project-images"

    # 计算资源大小
    local size=$(du -sh "$RESOURCE_DIR" | awk '{print $1}')
    print_success "资源目录组装完成 (大小: $size)"
}

# ── Step 3: Tauri 构建 ────────────────────────────────────
build_tauri() {
    print_info "开始 Tauri 构建..."
    cd src-tauri

    # 开发模式：cargo build
    if [ "$1" = "--dev" ]; then
        cargo build
    else
        # 发布模式
        cargo tauri build
    fi

    cd ..
}

# ── 主程序 ────────────────────────────────────────────────
echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}   Annotate - Tauri 构建脚本${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

MODE="${1:-release}"

prepare_venv
assemble_resources

if [ "$MODE" = "--dev" ]; then
    build_tauri --dev
    echo ""
    print_success "开发构建完成！"
    echo "  运行: cd src-tauri && cargo tauri dev"
else
    build_tauri
    echo ""
    print_success "构建完成！"
    echo "  应用包: src-tauri/target/release/bundle/dmg/Annotate.app"
fi

echo ""
