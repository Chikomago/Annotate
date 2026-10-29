"""
图像处理服务
需求: 4.4, 4.5, 4.9, 12.2, 12.6, 12.7

处理图像上传、PSD/PSB转换和图像优化
包含完整的错误处理和验证
"""
import os
import io
import base64
import logging
from typing import Tuple, Optional
from PIL import Image
from werkzeug.datastructures import FileStorage

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 尝试导入psd-tools
try:
    from psd_tools import PSDImage
    PSD_SUPPORT = True
except ImportError:
    PSD_SUPPORT = False
    logger.warning("psd-tools未安装，PSD/PSB转换功能不可用")


class ImageProcessingError(Exception):
    """图像处理错误基类"""
    def __init__(self, message: str, error_code: str = 'PROCESSING_ERROR'):
        self.message = message
        self.error_code = error_code
        super().__init__(self.message)


class ValidationError(ImageProcessingError):
    """验证错误"""
    def __init__(self, message: str):
        super().__init__(message, 'VALIDATION_ERROR')


class PSDConversionError(ImageProcessingError):
    """PSD转换错误"""
    def __init__(self, message: str):
        super().__init__(message, 'PSD_CONVERSION_ERROR')


class FileOperationError(ImageProcessingError):
    """文件操作错误"""
    def __init__(self, message: str):
        super().__init__(message, 'FILE_OPERATION_ERROR')


class ImageProcessingService:
    """处理图像上传和转换的服务类"""
    
    # 支持的图像格式
    SUPPORTED_FORMATS = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/gif': '.gif',
        'image/webp': '.webp'
    }
    
    # 支持的扩展名
    SUPPORTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.psd', '.psb']
    
    # 最大文件大小 (50MB)
    MAX_FILE_SIZE = 50 * 1024 * 1024
    
    # 最大图像宽度（用于优化）
    MAX_WIDTH = 2000
    
    # 图像质量（用于JPEG压缩）
    JPEG_QUALITY = 85
    
    def __init__(self, upload_folder: str = 'assets/uploads'):
        """
        初始化图像处理服务
        
        Args:
            upload_folder: 上传文件保存目录
        """
        self.upload_folder = upload_folder
        self._ensure_upload_folder()
    
    def _ensure_upload_folder(self):
        """确保上传目录存在"""
        if not os.path.exists(self.upload_folder):
            os.makedirs(self.upload_folder, exist_ok=True)
    
    def process_upload(self, file: FileStorage, project_id: Optional[str] = None) -> dict:
        """
        处理上传的图像文件
        
        Args:
            file: 上传的文件对象
            project_id: 项目ID（可选）
            
        Returns:
            dict: 处理结果，包含success, imageData, width, height等
        """
        try:
            # 验证文件
            validation = self.validate_image(file)
            if not validation['valid']:
                logger.warning(f"文件验证失败: {validation['error']}")
                return {
                    'success': False,
                    'message': validation['error'],
                    'errorCode': 'VALIDATION_ERROR'
                }
            
            # 读取文件内容
            try:
                file_content = file.read()
                file.seek(0)  # 重置文件指针
            except Exception as e:
                logger.error(f"读取文件失败: {str(e)}")
                return {
                    'success': False,
                    'message': '读取文件失败，请重试',
                    'errorCode': 'FILE_READ_ERROR'
                }
            
            # 检查文件内容是否为空
            if not file_content or len(file_content) == 0:
                logger.warning("文件内容为空")
                return {
                    'success': False,
                    'message': '文件内容为空',
                    'errorCode': 'EMPTY_FILE_ERROR'
                }
            
            # 获取原始格式
            filename = file.filename.lower()
            original_format = self._get_format_from_filename(filename)
            
            # 处理PSD/PSB文件
            if filename.endswith('.psd'):
                try:
                    image_data = self.convert_psd_to_png(file_content)
                    output_format = 'PNG'
                except PSDConversionError as e:
                    logger.error(f"PSD转换失败: {e.message}")
                    return {
                        'success': False,
                        'message': e.message,
                        'errorCode': e.error_code
                    }
            elif filename.endswith('.psb'):
                try:
                    image_data = self.convert_psb_to_png(file_content)
                    output_format = 'PNG'
                except PSDConversionError as e:
                    logger.error(f"PSB转换失败: {e.message}")
                    return {
                        'success': False,
                        'message': e.message,
                        'errorCode': e.error_code
                    }
            else:
                # 处理普通图像
                try:
                    image_data = self._process_standard_image(file_content)
                    output_format = 'PNG'
                except Exception as e:
                    logger.error(f"图像处理失败: {str(e)}")
                    return {
                        'success': False,
                        'message': f'图像处理失败: {str(e)}',
                        'errorCode': 'IMAGE_PROCESSING_ERROR'
                    }
            
            # 获取图像尺寸
            try:
                width, height = self.get_image_dimensions(image_data)
            except Exception as e:
                logger.error(f"获取图像尺寸失败: {str(e)}")
                return {
                    'success': False,
                    'message': '无法获取图像尺寸',
                    'errorCode': 'DIMENSION_ERROR'
                }
            
            # 转换为Base64
            try:
                base64_data = base64.b64encode(image_data).decode('utf-8')
                image_data_url = f"data:image/png;base64,{base64_data}"
            except Exception as e:
                logger.error(f"Base64编码失败: {str(e)}")
                return {
                    'success': False,
                    'message': '图像编码失败',
                    'errorCode': 'ENCODING_ERROR'
                }
            
            logger.info(f"图像处理成功: {filename}, 尺寸: {width}x{height}, 原始格式: {original_format}")
            
            return {
                'success': True,
                'imageData': image_data_url,
                'imageUrl': image_data_url,
                'originalFormat': original_format,
                'width': width,
                'height': height
            }
            
        except Exception as e:
            logger.exception(f"图像处理发生未知错误: {str(e)}")
            return {
                'success': False,
                'message': f'图像处理失败: {str(e)}',
                'errorCode': 'UNKNOWN_ERROR'
            }

    
    def convert_psd_to_png(self, psd_file: bytes) -> bytes:
        """
        将PSD文件转换为PNG
        
        Args:
            psd_file: PSD文件的字节内容
            
        Returns:
            bytes: PNG图像的字节内容
            
        Raises:
            PSDConversionError: 转换失败时抛出
        """
        if not PSD_SUPPORT:
            raise PSDConversionError("PSD转换功能不可用，请安装psd-tools库")
        
        try:
            # 验证PSD文件头
            if not self._validate_psd_header(psd_file):
                raise PSDConversionError("无效的PSD文件格式")
            
            # 从字节流加载PSD
            try:
                psd = PSDImage.open(io.BytesIO(psd_file))
            except Exception as e:
                logger.error(f"PSD文件解析失败: {str(e)}")
                raise PSDConversionError(f"PSD文件解析失败: 文件可能已损坏或使用了不支持的特性")
            
            # 合成图像
            try:
                image = psd.composite()
                if image is None:
                    raise PSDConversionError("PSD文件合成失败: 无法生成预览图像")
            except Exception as e:
                logger.error(f"PSD合成失败: {str(e)}")
                raise PSDConversionError(f"PSD文件合成失败: {str(e)}")
            
            # 转换为RGB模式（如果需要）
            try:
                if image.mode == 'RGBA':
                    # 保持RGBA以支持透明度
                    pass
                elif image.mode != 'RGB':
                    image = image.convert('RGB')
            except Exception as e:
                logger.error(f"颜色模式转换失败: {str(e)}")
                raise PSDConversionError(f"颜色模式转换失败: {str(e)}")
            
            # 调整大小（如果需要）
            image = self._resize_if_needed_pil(image)
            
            # 保存为PNG
            try:
                output = io.BytesIO()
                image.save(output, format='PNG', optimize=True)
                return output.getvalue()
            except Exception as e:
                logger.error(f"PNG保存失败: {str(e)}")
                raise PSDConversionError(f"PNG保存失败: {str(e)}")
            
        except PSDConversionError:
            raise
        except Exception as e:
            logger.exception(f"PSD转换发生未知错误: {str(e)}")
            raise PSDConversionError(f"PSD转换失败: {str(e)}")
    
    def convert_psb_to_png(self, psb_file: bytes) -> bytes:
        """
        将PSB文件转换为PNG
        PSB是大型PSD文件格式，psd-tools同样支持
        
        Args:
            psb_file: PSB文件的字节内容
            
        Returns:
            bytes: PNG图像的字节内容
            
        Raises:
            PSDConversionError: 转换失败时抛出
        """
        if not PSD_SUPPORT:
            raise PSDConversionError("PSB转换功能不可用，请安装psd-tools库")
        
        try:
            # 验证PSB文件头
            if not self._validate_psb_header(psb_file):
                raise PSDConversionError("无效的PSB文件格式")
            
            # PSB处理方式与PSD相同
            try:
                psd = PSDImage.open(io.BytesIO(psb_file))
            except Exception as e:
                logger.error(f"PSB文件解析失败: {str(e)}")
                raise PSDConversionError(f"PSB文件解析失败: 文件可能已损坏或使用了不支持的特性")
            
            # 合成图像
            try:
                image = psd.composite()
                if image is None:
                    raise PSDConversionError("PSB文件合成失败: 无法生成预览图像")
            except Exception as e:
                logger.error(f"PSB合成失败: {str(e)}")
                raise PSDConversionError(f"PSB文件合成失败: {str(e)}")
            
            # 转换为RGB模式（如果需要）
            try:
                if image.mode == 'RGBA':
                    pass
                elif image.mode != 'RGB':
                    image = image.convert('RGB')
            except Exception as e:
                logger.error(f"颜色模式转换失败: {str(e)}")
                raise PSDConversionError(f"颜色模式转换失败: {str(e)}")
            
            # 调整大小（如果需要）
            image = self._resize_if_needed_pil(image)
            
            # 保存为PNG
            try:
                output = io.BytesIO()
                image.save(output, format='PNG', optimize=True)
                return output.getvalue()
            except Exception as e:
                logger.error(f"PNG保存失败: {str(e)}")
                raise PSDConversionError(f"PNG保存失败: {str(e)}")
            
        except PSDConversionError:
            raise
        except Exception as e:
            logger.exception(f"PSB转换发生未知错误: {str(e)}")
            raise PSDConversionError(f"PSB转换失败: {str(e)}")
    
    def _validate_psd_header(self, file_content: bytes) -> bool:
        """
        验证PSD文件头
        
        Args:
            file_content: 文件字节内容
            
        Returns:
            bool: 是否为有效的PSD文件
        """
        if len(file_content) < 4:
            return False
        # PSD文件以 "8BPS" 开头
        return file_content[:4] == b'8BPS'
    
    def _validate_psb_header(self, file_content: bytes) -> bool:
        """
        验证PSB文件头
        PSB文件也以 "8BPS" 开头，但版本号不同
        
        Args:
            file_content: 文件字节内容
            
        Returns:
            bool: 是否为有效的PSB文件
        """
        if len(file_content) < 6:
            return False
        # PSB文件以 "8BPS" 开头，版本号为2
        return file_content[:4] == b'8BPS'
    
    def validate_image(self, file: FileStorage) -> dict:
        """
        验证图像文件格式和大小
        
        Args:
            file: 上传的文件对象
            
        Returns:
            dict: 验证结果 {valid: bool, error?: str, errorCode?: str}
        """
        if not file:
            return {
                'valid': False, 
                'error': '请选择文件',
                'errorCode': 'NO_FILE'
            }
        
        if not file.filename:
            return {
                'valid': False, 
                'error': '文件名无效',
                'errorCode': 'INVALID_FILENAME'
            }
        
        # 检查文件扩展名
        filename = file.filename.lower()
        has_valid_extension = any(filename.endswith(ext) for ext in self.SUPPORTED_EXTENSIONS)
        
        if not has_valid_extension:
            return {
                'valid': False,
                'error': '不支持的文件格式。请上传 PNG, JPG, JPEG, GIF, WebP, PSD 或 PSB 文件。',
                'errorCode': 'UNSUPPORTED_FORMAT'
            }
        
        # 检查文件大小
        try:
            file.seek(0, 2)  # 移动到文件末尾
            file_size = file.tell()
            file.seek(0)  # 重置到开头
        except Exception as e:
            logger.error(f"获取文件大小失败: {str(e)}")
            return {
                'valid': False,
                'error': '无法读取文件大小',
                'errorCode': 'FILE_SIZE_ERROR'
            }
        
        # 检查文件大小（PSD/PSB文件不限制大小）
        is_psd_psb = filename.endswith('.psd') or filename.endswith('.psb')
        
        if not is_psd_psb and file_size > self.MAX_FILE_SIZE:
            max_size_mb = self.MAX_FILE_SIZE / (1024 * 1024)
            return {
                'valid': False,
                'error': f'文件大小超过限制（最大{max_size_mb}MB）',
                'errorCode': 'FILE_TOO_LARGE'
            }
        
        if file_size == 0:
            return {
                'valid': False,
                'error': '文件内容为空',
                'errorCode': 'EMPTY_FILE'
            }
        
        # 对于PSD/PSB文件，进行额外的头部验证
        if filename.endswith('.psd') or filename.endswith('.psb'):
            try:
                header = file.read(4)
                file.seek(0)
                if header != b'8BPS':
                    return {
                        'valid': False,
                        'error': '无效的PSD/PSB文件格式',
                        'errorCode': 'INVALID_PSD_HEADER'
                    }
            except Exception as e:
                logger.error(f"读取PSD头部失败: {str(e)}")
                file.seek(0)
                # 不阻止上传，让后续处理来验证
        
        return {'valid': True}

    
    def resize_if_needed(self, image_data: bytes, max_width: int = None) -> bytes:
        """
        如果图像宽度超过限制则调整大小
        
        Args:
            image_data: 图像字节数据
            max_width: 最大宽度，默认使用MAX_WIDTH
            
        Returns:
            bytes: 调整后的图像字节数据
        """
        if max_width is None:
            max_width = self.MAX_WIDTH
        
        try:
            image = Image.open(io.BytesIO(image_data))
            image = self._resize_if_needed_pil(image, max_width)
            
            output = io.BytesIO()
            # 根据原始格式保存
            if image.mode == 'RGBA':
                image.save(output, format='PNG', optimize=True)
            else:
                image.save(output, format='PNG', optimize=True)
            
            return output.getvalue()
            
        except Exception as e:
            raise ValueError(f"图像调整大小失败: {str(e)}")
    
    def _resize_if_needed_pil(self, image: Image.Image, max_width: int = None) -> Image.Image:
        """
        使用PIL调整图像大小
        
        Args:
            image: PIL Image对象
            max_width: 最大宽度
            
        Returns:
            Image.Image: 调整后的图像
        """
        if max_width is None:
            max_width = self.MAX_WIDTH
        
        width, height = image.size
        
        if width > max_width:
            # 计算新高度，保持宽高比
            ratio = max_width / width
            new_height = int(height * ratio)
            # 确保新高度至少为1
            new_height = max(1, new_height)
            image = image.resize((max_width, new_height), Image.Resampling.LANCZOS)
        
        return image
    
    def get_image_dimensions(self, image_data: bytes) -> Tuple[int, int]:
        """
        获取图像尺寸
        
        Args:
            image_data: 图像字节数据
            
        Returns:
            Tuple[int, int]: (宽度, 高度)
        """
        try:
            image = Image.open(io.BytesIO(image_data))
            return image.size
        except Exception as e:
            raise ValueError(f"无法获取图像尺寸: {str(e)}")
    
    def _process_standard_image(self, image_data: bytes) -> bytes:
        """
        处理标准图像格式（PNG, JPG, GIF, WebP）
        
        Args:
            image_data: 原始图像字节数据
            
        Returns:
            bytes: 处理后的图像字节数据
        """
        try:
            image = Image.open(io.BytesIO(image_data))
            
            # 转换为RGB或RGBA
            if image.mode not in ('RGB', 'RGBA'):
                if image.mode == 'P' and 'transparency' in image.info:
                    image = image.convert('RGBA')
                else:
                    image = image.convert('RGB')
            
            # 调整大小（如果需要）
            image = self._resize_if_needed_pil(image)
            
            # 保存为PNG
            output = io.BytesIO()
            image.save(output, format='PNG', optimize=True)
            return output.getvalue()
            
        except Exception as e:
            raise ValueError(f"图像处理失败: {str(e)}")
    
    def _get_format_from_filename(self, filename: str) -> str:
        """
        从文件名获取格式
        
        Args:
            filename: 文件名
            
        Returns:
            str: 格式名称
        """
        filename = filename.lower()
        if filename.endswith('.psd'):
            return 'PSD'
        elif filename.endswith('.psb'):
            return 'PSB'
        elif filename.endswith('.png'):
            return 'PNG'
        elif filename.endswith(('.jpg', '.jpeg')):
            return 'JPEG'
        elif filename.endswith('.gif'):
            return 'GIF'
        elif filename.endswith('.webp'):
            return 'WebP'
        return 'Unknown'


# 创建全局实例
image_processing_service = ImageProcessingService()
