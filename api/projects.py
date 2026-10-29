"""
项目管理API端点
需求: 12.3, 12.4
"""
from flask import Blueprint, request, jsonify, send_file
from services.project_service import project_service
from services.project_image_store import image_path

bp = Blueprint('projects', __name__)


@bp.route('/<project_id>/image', methods=['GET', 'DELETE'])
def get_project_image(project_id):
    try:
        path = image_path(project_id)
    except ValueError:
        return jsonify({'message': '无效的任务 ID'}), 400
    if request.method == 'DELETE':
        path.unlink(missing_ok=True)
        return jsonify({'success': True})
    if not path.is_file():
        return jsonify({'message': '图像不存在'}), 404
    response = send_file(path, mimetype='image/png', conditional=False)
    response.headers['Cache-Control'] = 'no-store'
    return response


def get_current_user_id():
    """
    从请求中获取当前用户ID
    实际应用中应该从JWT token中解析
    """
    # 从Authorization header获取token
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header[7:]
        # 简化处理：直接使用token作为用户ID
        # 实际应用中应该验证和解析JWT
        if token:
            return token
    
    # 默认用户ID（用于开发测试）
    return 'default_user'


@bp.route('', methods=['GET'])
def list_projects():
    """
    获取项目列表
    
    Returns:
        JSON: {projects: [{id, name, createdAt, updatedAt}]}
    """
    user_id = get_current_user_id()
    projects = project_service.list_projects(user_id)
    return jsonify({'projects': projects})


@bp.route('', methods=['POST'])
def create_project():
    """
    创建新项目
    
    Request Body:
        {name: string}
        
    Returns:
        JSON: {success: boolean, project: Project}
    """
    data = request.get_json() or {}
    name = data.get('name', '新项目')
    user_id = get_current_user_id()
    
    try:
        project = project_service.create_project(name, user_id)
        return jsonify({
            'success': True,
            'project': project
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@bp.route('/<project_id>', methods=['GET'])
def get_project(project_id):
    """
    获取单个项目
    
    Args:
        project_id: 项目ID
        
    Returns:
        JSON: {project: Project | null}
    """
    user_id = get_current_user_id()
    project = project_service.get_project(project_id, user_id)
    
    if project:
        return jsonify({'project': project})
    else:
        return jsonify({'project': None}), 404


@bp.route('/<project_id>', methods=['PUT'])
def update_project(project_id):
    """
    更新项目
    
    Args:
        project_id: 项目ID
        
    Request Body:
        {project: Project} 或 {name, drawingElements, dividerLines, textBoxes, imageData}
        
    Returns:
        JSON: {success: boolean}
    """
    data = request.get_json() or {}
    user_id = get_current_user_id()
    
    # 支持两种格式：{project: {...}} 或直接 {...}
    update_data = data.get('project', data)
    
    success = project_service.update_project(project_id, update_data, user_id)
    
    if success:
        return jsonify({'success': True})
    else:
        return jsonify({
            'success': False,
            'message': '项目不存在或更新失败'
        }), 404


@bp.route('/<project_id>', methods=['DELETE'])
def delete_project(project_id):
    """
    删除项目
    
    Args:
        project_id: 项目ID
        
    Returns:
        JSON: {success: boolean}
    """
    user_id = get_current_user_id()
    success = project_service.delete_project(project_id, user_id)
    
    if success:
        return jsonify({'success': True})
    else:
        return jsonify({
            'success': False,
            'message': '项目不存在或删除失败'
        }), 404
