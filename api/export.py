"""
导出API端点
需求: 9.1, 12.5, 12.9
"""
from flask import Blueprint, request, jsonify, send_file
from services.export_service import export_service
from services.template_store import template_path, save_template

bp = Blueprint('export', __name__)


@bp.route('/template', methods=['GET', 'POST'])
def word_template():
    if request.method == 'GET':
        return jsonify({'uploaded': template_path().is_file()})
    file = request.files.get('file')
    if not file or not (file.filename or '').lower().endswith('.docx'):
        return jsonify({'message': '请选择 .docx 模板文件'}), 400
    try:
        save_template(file.stream)
    except Exception as error:
        return jsonify({'message': f'模板无法使用：{error}'}), 400
    return jsonify({'success': True, 'uploaded': True})


@bp.route('', methods=['POST'])
def export_to_word():
    """
    导出到Word文档 - 直接返回文件流
    需求: 9.1, 12.5
    
    请求体:
    {
        "projectId": "项目ID",
        "projectName": "项目名称",
        "imageData": "Base64图像数据",
        "imageRegions": [{"id": "region_0", "startY": 0, "endY": 100, ...}],
        "textBoxes": [{"id": "textbox_0", "content": "HTML内容", ...}],
        "dividerLines": [{"id": "divider_0", "yPosition": 100, ...}]
    }
    
    响应: Word文档文件流
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'message': '请求数据为空'
            }), 400
        
        # 调用导出服务
        result = export_service.export_to_word(data)
        
        if result.get('success'):
            # 直接返回文件流，手动设置Content-Disposition以支持中文文件名
            from flask import Response
            from urllib.parse import quote
            
            filename = result['filename']
            # RFC 5987 编码，支持中文文件名
            encoded_filename = quote(filename)
            
            response = Response(
                result['file_stream'].getvalue(),
                mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            )
            response.headers['Content-Disposition'] = f"attachment; filename*=UTF-8''{encoded_filename}"
            return response
        else:
            return jsonify({
                'success': False,
                'message': result.get('message', '导出失败'),
                'code': result.get('code')
            }), 409 if result.get('code') == 'TEMPLATE_MISSING' else 500
            
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'导出失败: {str(e)}'
        }), 500
