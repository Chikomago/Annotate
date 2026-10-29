"""
项目管理服务
实现项目CRUD操作和文件系统存储
需求: 12.3, 12.4
"""
import os
import json
import uuid
from datetime import datetime
from typing import Optional, List
from pathlib import Path


class ProjectService:
    """处理项目CRUD操作的服务类"""
    
    def __init__(self, data_dir: str = 'data/users'):
        """
        初始化项目服务
        
        Args:
            data_dir: 数据存储根目录
        """
        self.data_dir = Path(data_dir)
        self._ensure_data_dir()
    
    def _ensure_data_dir(self):
        """确保数据目录存在"""
        self.data_dir.mkdir(parents=True, exist_ok=True)
    
    def _get_user_projects_dir(self, user_id: str) -> Path:
        """获取用户项目目录路径"""
        return self.data_dir / user_id / 'projects'
    
    def _get_project_dir(self, user_id: str, project_id: str) -> Path:
        """获取项目目录路径"""
        return self._get_user_projects_dir(user_id) / project_id
    
    def _get_metadata_path(self, user_id: str, project_id: str) -> Path:
        """获取项目元数据文件路径"""
        return self._get_project_dir(user_id, project_id) / 'metadata.json'
    
    def _get_annotations_path(self, user_id: str, project_id: str) -> Path:
        """获取项目标注数据文件路径"""
        return self._get_project_dir(user_id, project_id) / 'annotations.json'
    
    def _get_image_path(self, user_id: str, project_id: str) -> Path:
        """获取项目图像文件路径"""
        return self._get_project_dir(user_id, project_id) / 'image.png'
    
    def _generate_id(self) -> str:
        """生成唯一项目ID"""
        return f"project_{datetime.now().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}"
    
    def create_project(self, name: str, user_id: str) -> dict:
        """
        创建新项目
        
        Args:
            name: 项目名称
            user_id: 用户ID
            
        Returns:
            创建的项目对象
        """
        project_id = self._generate_id()
        now = datetime.now().isoformat()
        
        # 创建项目目录
        project_dir = self._get_project_dir(user_id, project_id)
        project_dir.mkdir(parents=True, exist_ok=True)
        
        # 创建元数据
        metadata = {
            'id': project_id,
            'name': name,
            'userId': user_id,
            'createdAt': now,
            'updatedAt': now
        }
        
        # 创建标注数据
        annotations = {
            'drawingElements': [],
            'dividerLines': [],
            'textBoxes': []
        }
        
        # 保存元数据
        metadata_path = self._get_metadata_path(user_id, project_id)
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)
        
        # 保存标注数据
        annotations_path = self._get_annotations_path(user_id, project_id)
        with open(annotations_path, 'w', encoding='utf-8') as f:
            json.dump(annotations, f, ensure_ascii=False, indent=2)
        
        # 返回完整项目对象
        return {
            **metadata,
            'imageData': None,
            **annotations
        }
    
    def get_project(self, project_id: str, user_id: str = None) -> Optional[dict]:
        """
        获取单个项目
        
        Args:
            project_id: 项目ID
            user_id: 用户ID（可选，如果提供则只在该用户目录下查找）
            
        Returns:
            项目对象或None
        """
        # 如果提供了user_id，直接查找
        if user_id:
            return self._load_project(user_id, project_id)
        
        # 否则遍历所有用户目录查找
        if not self.data_dir.exists():
            return None
            
        for user_dir in self.data_dir.iterdir():
            if user_dir.is_dir():
                project = self._load_project(user_dir.name, project_id)
                if project:
                    return project
        
        return None
    
    def _load_project(self, user_id: str, project_id: str) -> Optional[dict]:
        """
        从文件系统加载项目
        
        Args:
            user_id: 用户ID
            project_id: 项目ID
            
        Returns:
            项目对象或None
        """
        metadata_path = self._get_metadata_path(user_id, project_id)
        annotations_path = self._get_annotations_path(user_id, project_id)
        
        if not metadata_path.exists():
            return None
        
        try:
            # 加载元数据
            with open(metadata_path, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
            
            # 加载标注数据
            annotations = {'drawingElements': [], 'dividerLines': [], 'textBoxes': []}
            if annotations_path.exists():
                with open(annotations_path, 'r', encoding='utf-8') as f:
                    annotations = json.load(f)
            
            # 检查是否有图像
            image_path = self._get_image_path(user_id, project_id)
            image_data = None
            if image_path.exists():
                # 读取图像并转为Base64（可选，根据需要）
                import base64
                with open(image_path, 'rb') as f:
                    image_bytes = f.read()
                    image_data = f"data:image/png;base64,{base64.b64encode(image_bytes).decode()}"
            
            return {
                **metadata,
                'imageData': image_data,
                **annotations
            }
        except (json.JSONDecodeError, IOError) as e:
            print(f"加载项目失败: {e}")
            return None
    
    def update_project(self, project_id: str, data: dict, user_id: str = None) -> bool:
        """
        更新项目
        
        Args:
            project_id: 项目ID
            data: 更新数据
            user_id: 用户ID
            
        Returns:
            是否更新成功
        """
        # 查找项目所属用户
        if not user_id:
            existing = self.get_project(project_id)
            if not existing:
                return False
            user_id = existing.get('userId')
        
        if not user_id:
            return False
        
        metadata_path = self._get_metadata_path(user_id, project_id)
        annotations_path = self._get_annotations_path(user_id, project_id)
        
        if not metadata_path.exists():
            return False
        
        try:
            # 加载现有元数据
            with open(metadata_path, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
            
            # 更新元数据字段
            if 'name' in data:
                metadata['name'] = data['name']
            metadata['updatedAt'] = datetime.now().isoformat()
            
            # 保存元数据
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, ensure_ascii=False, indent=2)
            
            # 更新标注数据
            annotations = {}
            if annotations_path.exists():
                with open(annotations_path, 'r', encoding='utf-8') as f:
                    annotations = json.load(f)
            
            if 'drawingElements' in data:
                annotations['drawingElements'] = data['drawingElements']
            if 'dividerLines' in data:
                annotations['dividerLines'] = data['dividerLines']
            if 'textBoxes' in data:
                annotations['textBoxes'] = data['textBoxes']
            
            with open(annotations_path, 'w', encoding='utf-8') as f:
                json.dump(annotations, f, ensure_ascii=False, indent=2)
            
            # 处理图像数据
            if 'imageData' in data and data['imageData']:
                self._save_image(user_id, project_id, data['imageData'])
            
            return True
        except (json.JSONDecodeError, IOError) as e:
            print(f"更新项目失败: {e}")
            return False
    
    def _save_image(self, user_id: str, project_id: str, image_data: str):
        """
        保存图像数据
        
        Args:
            user_id: 用户ID
            project_id: 项目ID
            image_data: Base64编码的图像数据
        """
        import base64
        
        # 解析Base64数据
        if ',' in image_data:
            image_data = image_data.split(',')[1]
        
        image_bytes = base64.b64decode(image_data)
        image_path = self._get_image_path(user_id, project_id)
        
        with open(image_path, 'wb') as f:
            f.write(image_bytes)
    
    def delete_project(self, project_id: str, user_id: str = None) -> bool:
        """
        删除项目
        
        Args:
            project_id: 项目ID
            user_id: 用户ID
            
        Returns:
            是否删除成功
        """
        # 查找项目所属用户
        if not user_id:
            existing = self.get_project(project_id)
            if not existing:
                return False
            user_id = existing.get('userId')
        
        if not user_id:
            return False
        
        project_dir = self._get_project_dir(user_id, project_id)
        
        if not project_dir.exists():
            return False
        
        try:
            import shutil
            shutil.rmtree(project_dir)
            return True
        except IOError as e:
            print(f"删除项目失败: {e}")
            return False
    
    def list_projects(self, user_id: str) -> List[dict]:
        """
        获取用户的所有项目
        
        Args:
            user_id: 用户ID
            
        Returns:
            项目列表（只包含元数据，不包含图像和标注数据）
        """
        projects_dir = self._get_user_projects_dir(user_id)
        
        if not projects_dir.exists():
            return []
        
        projects = []
        for project_dir in projects_dir.iterdir():
            if project_dir.is_dir():
                metadata_path = project_dir / 'metadata.json'
                if metadata_path.exists():
                    try:
                        with open(metadata_path, 'r', encoding='utf-8') as f:
                            metadata = json.load(f)
                            projects.append(metadata)
                    except (json.JSONDecodeError, IOError):
                        continue
        
        # 按更新时间降序排序
        projects.sort(key=lambda x: x.get('updatedAt', ''), reverse=True)
        
        return projects


# 创建全局实例
project_service = ProjectService()
