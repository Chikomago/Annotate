#!/bin/bash

# 设置二进制文件执行权限脚本
# 用途：为编译后的二进制文件添加可执行权限

# 定义二进制文件路径
BINARY_PATH="模板标注系统/annotation-system"

# 检查文件是否存在
if [ ! -f "$BINARY_PATH" ]; then
    echo "错误: 找不到文件 '$BINARY_PATH'"
    echo "请确保已经使用 Nuitka 编译生成了二进制文件"
    exit 1
fi

# 添加执行权限
echo "正在为 '$BINARY_PATH' 添加执行权限..."
chmod +x "$BINARY_PATH"

# 检查是否成功
if [ $? -eq 0 ]; then
    echo "✓ 成功添加执行权限"
    
    # 显示文件权限
    echo ""
    echo "当前文件权限:"
    ls -lh "$BINARY_PATH"
    
    echo ""
    echo "现在可以运行: ./$BINARY_PATH"
else
    echo "✗ 添加执行权限失败"
    exit 1
fi
