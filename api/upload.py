"""
图像上传API端点
需求: 4.4, 4.5, 4.9, 12.2, 12.6, 12.7

包含完整的错误处理和详细错误信息返回
"""
import logging
import base64
from flask import Blueprint, request, jsonify
from services.image_processing_service import image_processing_service
from services.project_image_store import save_image

# 配置日志
logger = logging.getLogger(__name__)

bp = Blueprint('upload', __name__)


@bp.route('/image', methods=['POST'])
def upload_image():
    """
    上传图像文件
    
    请求格式: multipart/form-data
    - file: 图像文件 (支持 PNG, JPG, JPEG, GIF, WebP, PSD, PSB)
    - projectId: 项目ID (可选)
    
    响应格式:
    {
        "success": boolean,
        "imageData": string (Base64 data URL),
        "imageUrl": string,
        "originalFormat": string,
        "width": number,
        "height": number,
        "message": string (仅在失败时),
        "errorCode": string (仅在失败时)
    }
    """
    try:
        # 检查是否有文件
        if 'file' not in request.files:
            logger.warning("上传请求中没有文件")
            return jsonify({
                'success': False,
                'message': '请选择要上传的文件',
                'errorCode': 'NO_FILE'
            }), 400
        
        file = request.files['file']
        
        # 检查文件名
        if file.filename == '':
            logger.warning("上传的文件名为空")
            return jsonify({
                'success': False,
                'message': '请选择要上传的文件',
                'errorCode': 'EMPTY_FILENAME'
            }), 400
        
        # 获取项目ID（可选）
        project_id = request.form.get('projectId')
        
        logger.info(f"开始处理上传文件: {file.filename}, 项目ID: {project_id}")
        
        # 处理图像
        result = image_processing_service.process_upload(file, project_id)
        
        if result['success']:
            if project_id:
                try:
                    image_bytes = base64.b64decode(result['imageData'].split(',', 1)[1])
                    save_image(project_id, image_bytes)
                    result['imageStored'] = True
                except (OSError, ValueError) as error:
                    logger.exception('保存项目图像失败: %s', error)
                    return jsonify({
                        'success': False,
                        'message': '图像处理完成，但保存到本地文件失败。请检查可用空间或目录权限。',
                        'errorCode': 'IMAGE_SAVE_ERROR'
                    }), 500
            logger.info(f"文件上传成功: {file.filename}")
            return jsonify(result), 200
        else:
            logger.warning(f"文件上传失败: {file.filename}, 错误: {result.get('message')}")
            return jsonify(result), 400
            
    except Exception as e:
        logger.exception(f"上传处理发生未知错误: {str(e)}")
        return jsonify({
            'success': False,
            'message': f'服务器内部错误: {str(e)}',
            'errorCode': 'INTERNAL_ERROR'
        }), 500


@bp.route('/validate', methods=['POST'])
def validate_image():
    """
    验证图像文件（不上传）
    
    请求格式: multipart/form-data
    - file: 图像文件
    
    响应格式:
    {
        "valid": boolean,
        "error": string (仅在无效时),
        "errorCode": string (仅在无效时)
    }
    """
    try:
        if 'file' not in request.files:
            return jsonify({
                'valid': False,
                'error': '请选择要验证的文件',
                'errorCode': 'NO_FILE'
            }), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({
                'valid': False,
                'error': '请选择要验证的文件',
                'errorCode': 'EMPTY_FILENAME'
            }), 400
        
        result = image_processing_service.validate_image(file)
        
        return jsonify(result), 200 if result['valid'] else 400
        
    except Exception as e:
        logger.exception(f"验证处理发生未知错误: {str(e)}")
        return jsonify({
            'valid': False,
            'error': f'服务器内部错误: {str(e)}',
            'errorCode': 'INTERNAL_ERROR'
        }), 500
