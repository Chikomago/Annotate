"""
Word文档导出服务
需求: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 12.5, 12.8, 12.9

处理Word文档导出，包括图像插入和富文本格式保留
"""
import os
import sys
import io
import base64
import re
import html
import uuid
import math
from typing import List, Dict, Optional, Tuple
from docx import Document
from docx.shared import Inches, Cm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from PIL import Image, ImageDraw, ImageFont


def get_resource_path(filename: str) -> str:
    """
    获取资源文件路径，优先使用外部文件（可执行文件同目录），其次使用内部资源
    """
    # 1. 优先检查可执行文件所在目录（用户提供的外部文件）
    if getattr(sys, 'frozen', False):
        # 使用 realpath 获取真实路径，自动处理符号链接
        exe_path = os.path.realpath(sys.executable)
        exe_dir = os.path.dirname(exe_path)
        
        external_path = os.path.join(exe_dir, filename)
        if os.path.exists(external_path):
            return external_path
            
    # 2. 检查当前工作目录
    if os.path.exists(filename):
        return filename
        
    # 3. 检查内部资源（打包进来的文件）
    if getattr(sys, 'frozen', False):
        # PyInstaller / Nuitka 临时目录
        if hasattr(sys, '_MEIPASS'):
            internal_path = os.path.join(sys._MEIPASS, filename)
            if os.path.exists(internal_path):
                return internal_path
                
        # 检查 sys.prefix (有些打包工具会用到)
        if hasattr(sys, 'prefix'):
            prefix_path = os.path.join(sys.prefix, filename)
            if os.path.exists(prefix_path):
                return prefix_path

    # 返回原文件名，让上层处理
    return filename


class ExportService:
    """处理Word文档导出的服务类"""
    
    # Word文档中图像的最大宽度（厘米）
    MAX_IMAGE_WIDTH_CM = 7
    MIN_IMAGE_WIDTH_CM = 1
    
    # 图像压缩配置
    JPEG_QUALITY = 85  # JPEG质量 (1-100)，85是质量和大小的平衡点
    MAX_IMAGE_DIMENSION = 2000  # 图像最大尺寸（像素），超过会等比缩放
    
    def __init__(self, template_path: str = 'template.docx'):
        """
        初始化导出服务
        
        Args:
            template_path: Word模板文件路径
        """
        self.template_path = get_resource_path(template_path)
    
    def export_to_word(self, project_data: dict) -> dict:
        """
        导出项目到Word文档
        需求: 9.1, 9.2, 12.5
        """
        try:
            # 获取图片质量参数（默认85%）
            image_quality = project_data.get('imageQuality', 85)
            
            # 加载模板文档
            if os.path.exists(self.template_path):
                doc = Document(self.template_path)
            else:
                doc = Document()
            
            # 获取或创建表格
            table = self._get_or_create_table(doc)
            
            # 处理图像区域
            text_boxes = project_data.get('textBoxes', [])
            image_data = project_data.get('imageData', '')
            divider_lines = project_data.get('dividerLines', [])
            drawing_elements = project_data.get('drawingElements', [])
            inserted_image_boxes = project_data.get('insertedImageBoxes', [])
            image_regions = project_data.get('imageRegions', [])
            display_width = project_data.get('displayWidth')
            display_height = project_data.get('displayHeight')
            
            # 如果有图像数据和分割线，切割图像
            if image_data and divider_lines:
                region_images = self._split_image_by_dividers_with_boxes(
                    image_data, divider_lines, drawing_elements, 
                    inserted_image_boxes, image_regions,
                    display_width, display_height, image_quality
                )
            elif image_data:
                region_images = self._split_image_by_dividers_with_boxes(
                    image_data, [], drawing_elements, 
                    inserted_image_boxes, image_regions,
                    display_width, display_height, image_quality
                )
            else:
                region_images = []
            
            # 没有图像时仍保留已完成的文字标注。
            row_count = len(region_images) if region_images else len(text_boxes)
            for i in range(row_count):
                region_image = region_images[i] if i < len(region_images) else None
                text_content = ''
                region_title = ''
                if i < len(text_boxes):
                    text_content = text_boxes[i].get('content', '')
                    region_title = text_boxes[i].get('title', '')
                
                self._add_region_row(table, i, region_image, text_content, region_title)
            
            # 生成输出文件名
            project_name = project_data.get('projectName', '') or '未命名项目'
            filename = f"{project_name}_模板说明.docx"
            
            # 保存到内存流而不是文件
            file_stream = io.BytesIO()
            doc.save(file_stream)
            file_stream.seek(0)
            
            return {
                'success': True,
                'filename': filename,
                'file_stream': file_stream
            }
            
        except Exception as e:
            return {
                'success': False,
                'message': f'导出失败: {str(e)}'
            }
    
    def _get_or_create_table(self, doc: Document):
        """获取文档中的表格或创建新表格"""
        if doc.tables:
            return doc.tables[-1]
        
        table = doc.add_table(rows=1, cols=3)
        table.style = 'Table Grid'
        
        header_cells = table.rows[0].cells
        header_cells[0].text = '序号'
        header_cells[1].text = '图像'
        header_cells[2].text = '说明'
        
        for i, width in enumerate([Cm(1.5), Cm(10), Cm(6)]):
            for cell in table.columns[i].cells:
                cell.width = width
        
        return table
    
    def _add_region_row(self, table, index: int, image_data: str, text_content: str, region_title: str = ''):
        """添加一行区域数据到表格"""
        row = table.add_row()
        cells = row.cells
        
        # 第1列：区域标题（不带序号前缀） - 垂直+水平居中，微软雅黑，六号字体
        title_text = region_title if region_title else f'区域 {index + 1}'
        paragraph = cells[0].paragraphs[0]
        paragraph.clear()
        run = paragraph.add_run(title_text)
        run.font.name = '微软雅黑'
        run._element.rPr.rFonts.set(qn('w:eastAsia'), '微软雅黑')
        run.font.size = Pt(6.5)  # 六号字体
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        
        # 垂直居中
        tc = cells[0]._tc
        tcPr = tc.get_or_add_tcPr()
        tcVAlign = OxmlElement('w:vAlign')
        tcVAlign.set(qn('w:val'), 'center')
        tcPr.append(tcVAlign)
        
        # 第2列：图像
        if image_data:
            self.insert_image_to_cell(table, len(table.rows) - 1, 1, image_data)
        
        # 第3列：富文本 - 垂直居中，水平居左，微软雅黑，六号字体
        if text_content:
            self.insert_html_to_cell(table, len(table.rows) - 1, 2, text_content)
        
        # 设置第3列垂直居中
        tc3 = cells[2]._tc
        tcPr3 = tc3.get_or_add_tcPr()
        tcVAlign3 = OxmlElement('w:vAlign')
        tcVAlign3.set(qn('w:val'), 'center')
        tcPr3.append(tcVAlign3)

    def insert_image_to_cell(self, table, row: int, col: int, image_data: str):
        """将图像插入到表格单元格"""
        try:
            cell = table.rows[row].cells[col]
            
            image_bytes = self._decode_base64_image(image_data)
            if not image_bytes:
                return
            
            width, height = self._get_image_dimensions(image_bytes)
            display_width = self._calculate_display_width(width, height)
            
            image_stream = io.BytesIO(image_bytes)
            cell.text = ''
            
            paragraph = cell.paragraphs[0]
            run = paragraph.add_run()
            run.add_picture(image_stream, width=display_width)
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            
        except Exception as e:
            print(f"插入图像失败: {str(e)}")
    
    def insert_html_to_cell(self, table, row: int, col: int, html_content: str):
        """将HTML内容插入到表格单元格"""
        try:
            cell = table.rows[row].cells[col]
            cell.text = ''
            self._parse_html_to_cell(cell, html_content)
        except Exception as e:
            print(f"插入HTML内容失败: {str(e)}")
    
    def _parse_html_to_cell(self, cell, html_content: str):
        """解析HTML内容并添加到单元格，保持图片位置"""
        if not html_content:
            return
        
        html_content = html_content.strip()
        
        # 使用占位符标记图片位置
        img_pattern = r'<img[^>]+>'
        img_matches = list(re.finditer(img_pattern, html_content, re.IGNORECASE))
        img_data_list = []
        
        # 提取图片信息并替换为占位符
        for i, match in enumerate(img_matches):
            img_tag = match.group()
            placeholder = f'{{{{IMG_PLACEHOLDER_{i}}}}}'
            
            # 提取图片信息
            src_match = re.search(r'src=["\']([^"\']+)["\']', img_tag, re.IGNORECASE)
            if src_match:
                img_src = src_match.group(1)
                
                # 提取宽度
                width_attr = None
                width_match = re.search(r'width=["\']?(\d+)', img_tag, re.IGNORECASE)
                if width_match:
                    width_attr = int(width_match.group(1))
                
                style_match = re.search(r'style=["\']([^"\']+)["\']', img_tag, re.IGNORECASE)
                if style_match:
                    style = style_match.group(1)
                    style_width = re.search(r'width:\s*(\d+)px', style)
                    if style_width:
                        width_attr = int(style_width.group(1))
                
                img_data_list.append({
                    'src': img_src,
                    'width': width_attr,
                    'placeholder': placeholder
                })
            
            html_content = html_content.replace(img_tag, placeholder, 1)
        
        # 分割HTML为段落
        paragraphs = self._split_html_paragraphs(html_content)
        
        first_paragraph = True
        for para_html in paragraphs:
            if first_paragraph:
                paragraph = cell.paragraphs[0]
                first_paragraph = False
            else:
                paragraph = cell.add_paragraph()
            
            # 检查是否包含图片占位符，支持同一段落中的多个图片
            has_img = False
            remaining_html = para_html
            
            for img_data in img_data_list:
                if img_data['placeholder'] in remaining_html:
                    has_img = True
                    # 分割文本和图片
                    parts = remaining_html.split(img_data['placeholder'], 1)
                    
                    # 添加图片前的文本
                    if parts[0].strip():
                        self._add_formatted_text(paragraph, parts[0])
                    
                    # 添加图片
                    if img_data['src'].startswith('data:image'):
                        self._insert_inline_image(paragraph, img_data['src'], img_data['width'])
                    
                    # 继续处理剩余部分（可能还有更多图片）
                    remaining_html = parts[1] if len(parts) > 1 else ''
            
            # 添加最后一个图片之后的文本
            if has_img and remaining_html.strip():
                self._add_formatted_text(paragraph, remaining_html)
            
            # 如果没有图片，正常添加文本
            if not has_img and para_html.strip():
                self._add_formatted_text(paragraph, para_html)
    
    def _insert_inline_image(self, paragraph, img_src: str, width_attr: int = None):
        """
        在段落中插入内嵌图片
        根据缩放比例计算导出宽度，100% = 7cm
        """
        try:
            image_bytes = self._decode_base64_image(img_src)
            if not image_bytes:
                return
            
            run = paragraph.add_run()
            image_stream = io.BytesIO(image_bytes)
            
            # 获取原始图片尺寸
            original_width, original_height = self._get_image_dimensions(image_bytes)
            
            if width_attr and width_attr > 0 and original_width > 0:
                # 计算缩放百分比
                scale_percent = width_attr / original_width
                # 基于 100% = 7cm 计算导出宽度
                width_cm = self.MAX_IMAGE_WIDTH_CM * scale_percent
                # 限制最小和最大值
                width_cm = max(self.MIN_IMAGE_WIDTH_CM, min(width_cm, self.MAX_IMAGE_WIDTH_CM))
                display_width = Cm(width_cm)
            else:
                # 没有指定宽度，使用默认计算
                display_width = self._calculate_display_width(original_width, original_height)
            
            run.add_picture(image_stream, width=display_width)
        except Exception as e:
            print(f"插入内嵌图片失败: {str(e)}")
    
    def _process_inline_images(self, cell, html_content: str) -> str:
        """处理HTML中的内嵌图片"""
        img_pattern = r'<img[^>]+>'
        matches = re.findall(img_pattern, html_content, re.IGNORECASE)
        
        for img_tag in matches:
            try:
                src_match = re.search(r'src=["\']([^"\']+)["\']', img_tag, re.IGNORECASE)
                if not src_match:
                    continue
                    
                img_src = src_match.group(1)
                
                width_attr = None
                width_match = re.search(r'width=["\']?(\d+)', img_tag, re.IGNORECASE)
                if width_match:
                    width_attr = int(width_match.group(1))
                
                style_match = re.search(r'style=["\']([^"\']+)["\']', img_tag, re.IGNORECASE)
                if style_match:
                    style = style_match.group(1)
                    style_width = re.search(r'width:\s*(\d+)px', style)
                    if style_width:
                        width_attr = int(style_width.group(1))
                
                if img_src.startswith('data:image'):
                    image_bytes = self._decode_base64_image(img_src)
                    if image_bytes:
                        paragraph = cell.add_paragraph()
                        run = paragraph.add_run()
                        image_stream = io.BytesIO(image_bytes)
                        
                        if width_attr and width_attr > 0:
                            width_cm = width_attr / 96 * 2.54
                            width_cm = min(width_cm, self.MAX_IMAGE_WIDTH_CM)
                            display_width = Cm(width_cm)
                        else:
                            width, height = self._get_image_dimensions(image_bytes)
                            display_width = self._calculate_display_width(width, height)
                        
                        run.add_picture(image_stream, width=display_width)
                        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            except Exception as e:
                print(f"处理内嵌图片失败: {str(e)}")
        
        html_content = re.sub(img_pattern, '', html_content)
        return html_content
    
    def _split_html_paragraphs(self, html_content: str) -> List[str]:
        """将HTML内容分割为段落"""
        paragraphs = []

        content = html_content

        content = re.sub(r'<br\s*/?>', '\n', content, flags=re.IGNORECASE)

        img_placeholder_pattern = r'\{\{IMG_PLACEHOLDER_\d+\}\}'
        content = re.sub(img_placeholder_pattern, lambda m: m.group().replace('\n', '\x00'), content)

        content = re.sub(r'</div>\s*<div[^>]*>', '\n', content, flags=re.IGNORECASE)
        content = re.sub(r'</p>\s*<p[^>]*>', '\n', content, flags=re.IGNORECASE)
        content = re.sub(r'</?div[^>]*>', '\n', content, flags=re.IGNORECASE)
        content = re.sub(r'</?p[^>]*>', '\n', content, flags=re.IGNORECASE)

        lines = content.split('\n')
        for line in lines:
            line = line.strip().replace('\x00', '\n')
            if line:
                paragraphs.append(line)

        if not paragraphs and html_content.strip():
            paragraphs.append(html_content)

        return paragraphs
    
    def _add_formatted_text(self, paragraph, html_content: str):
        """添加格式化文本到段落 - 微软雅黑，六号字体，水平居左"""
        # 设置段落水平居左
        paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
        
        # 移除所有HTML标签，只保留纯文本
        plain_text = re.sub(r'<[^>]+>', '', html_content)
        # 解码所有HTML实体（&nbsp; → 空格，&gt; → >，&lt; → <，&amp; → & 等）
        plain_text = html.unescape(plain_text)
        
        if plain_text.strip():
            # 检测格式
            has_bold = '<b>' in html_content.lower() or '<strong>' in html_content.lower()
            has_italic = '<i>' in html_content.lower() or '<em>' in html_content.lower()
            has_underline = '<u>' in html_content.lower()
            
            # 提取颜色
            color = None
            font_match = re.search(r'<font[^>]*color=["\']?([^"\'>\s]+)', html_content, re.IGNORECASE)
            if font_match:
                color = font_match.group(1)
            else:
                span_match = re.search(r'style=["\'][^"\']*color:\s*([^;"\'>]+)', html_content, re.IGNORECASE)
                if span_match:
                    color = span_match.group(1)
            
            run = paragraph.add_run(plain_text)
            
            # 设置字体为微软雅黑，六号（6.5pt）
            run.font.name = '微软雅黑'
            run._element.rPr.rFonts.set(qn('w:eastAsia'), '微软雅黑')
            run.font.size = Pt(6.5)  # 六号字体
            
            if has_bold:
                run.bold = True
            if has_italic:
                run.italic = True
            if has_underline:
                run.underline = True
            if color:
                try:
                    color_hex = color.lstrip('#')
                    if len(color_hex) == 6:
                        r = int(color_hex[0:2], 16)
                        g = int(color_hex[2:4], 16)
                        b = int(color_hex[4:6], 16)
                        run.font.color.rgb = RGBColor(r, g, b)
                except:
                    pass

    def _decode_base64_image(self, image_data: str) -> Optional[bytes]:
        """解码Base64图像数据"""
        try:
            if ',' in image_data:
                image_data = image_data.split(',')[1]
            return base64.b64decode(image_data)
        except Exception as e:
            print(f"解码图像失败: {str(e)}")
            return None
    
    def _get_image_dimensions(self, image_bytes: bytes) -> Tuple[int, int]:
        """获取图像尺寸"""
        try:
            image = Image.open(io.BytesIO(image_bytes))
            return image.size
        except Exception as e:
            print(f"获取图像尺寸失败: {str(e)}")
            return (100, 100)
    
    def _calculate_display_width(self, width: int, height: int) -> Cm:
        """计算显示宽度，保持宽高比，最小1cm，最大7cm，确保图片能完整显示"""
        # 计算原始宽度（厘米）
        width_cm = width / 96 * 2.54  # 假设96 DPI
        
        # 对于非常窄的图片（高度远大于宽度），确保有最小宽度
        aspect_ratio = width / height if height > 0 else 1
        
        # 如果图片太窄（宽高比小于0.3），使用最小宽度
        if aspect_ratio < 0.3:
            return Cm(self.MIN_IMAGE_WIDTH_CM)
        
        # 限制在最小和最大范围内
        if width_cm < self.MIN_IMAGE_WIDTH_CM:
            return Cm(self.MIN_IMAGE_WIDTH_CM)
        if width_cm > self.MAX_IMAGE_WIDTH_CM:
            return Cm(self.MAX_IMAGE_WIDTH_CM)
        return Cm(width_cm)
    
    def _split_image_by_dividers_with_boxes(self, image_data: str, divider_lines: List[dict], 
                                            drawing_elements: List[dict] = None,
                                            inserted_image_boxes: List[dict] = None,
                                            image_regions: List[dict] = None,
                                            display_width: int = None, 
                                            display_height: int = None,
                                            image_quality: int = 85) -> List[str]:
        """
        根据分割线切割图像，支持插入的图片框
        需求: 9.3, 9.4, 13.12
        """
        try:
            # 如果没有插入的图片框，使用原来的方法
            if not inserted_image_boxes or len(inserted_image_boxes) == 0:
                return self._split_image_by_dividers(
                    image_data, divider_lines, drawing_elements,
                    display_width, display_height, image_quality
                )
            
            image_bytes = self._decode_base64_image(image_data)
            if not image_bytes:
                return []
            
            img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
            img_width, img_height = img.size
            
            # 如果有绘图元素，合成到图像上
            if drawing_elements:
                img = self._composite_drawing_elements(img, drawing_elements, display_width, display_height)
            
            # 如果没有分割线，返回整个图像
            if not divider_lines:
                return [self._encode_image_to_base64(img, image_quality)]
            
            # 按Y坐标排序分割线
            sorted_lines = sorted(divider_lines, key=lambda x: x.get('yPosition', x.get('y', 0)))
            
            # 计算缩放比例
            scale_x = img_width / display_width if display_width else 1
            scale_y = img_height / display_height if display_height else 1
            
            # 创建插入图片框的映射（按Y坐标）
            image_box_map = {}
            if inserted_image_boxes:
                for box in inserted_image_boxes:
                    y_pos = box.get('yPosition', 0)
                    image_box_map[y_pos] = box
            
            # 切割图像
            regions = []
            prev_y = 0
            
            for line in sorted_lines:
                line_y = line.get('yPosition', line.get('y', 0))
                y = int(line_y * scale_y)
                
                # 检查该区域是否对应插入的图片框
                is_inserted = False
                inserted_box = None
                
                # 在image_regions中查找该区域的类型
                if image_regions:
                    for region in image_regions:
                        if abs(region.get('startY', 0) - prev_y / scale_y) < 5:
                            if region.get('type') == 'inserted':
                                is_inserted = True
                                image_box_id = region.get('imageBoxId')
                                # 查找对应的图片框
                                for box in inserted_image_boxes:
                                    if box.get('id') == image_box_id:
                                        inserted_box = box
                                        break
                                break
                
                if is_inserted and inserted_box and inserted_box.get('imageData'):
                    # 使用插入的图片框的图片数据
                    regions.append(inserted_box.get('imageData'))
                elif y > prev_y and y < img_height:
                    # 使用原始图像的切割区域
                    region = img.crop((0, prev_y, img_width, y))
                    regions.append(self._encode_image_to_base64(region, image_quality))
                
                prev_y = y
            
            # 添加最后一个区域
            if prev_y < img_height:
                # 检查最后一个区域是否是插入的图片框
                is_inserted = False
                inserted_box = None
                
                if image_regions:
                    for region in image_regions:
                        if abs(region.get('startY', 0) - prev_y / scale_y) < 5:
                            if region.get('type') == 'inserted':
                                is_inserted = True
                                image_box_id = region.get('imageBoxId')
                                for box in inserted_image_boxes:
                                    if box.get('id') == image_box_id:
                                        inserted_box = box
                                        break
                                break
                
                if is_inserted and inserted_box and inserted_box.get('imageData'):
                    regions.append(inserted_box.get('imageData'))
                else:
                    region = img.crop((0, prev_y, img_width, img_height))
                    regions.append(self._encode_image_to_base64(region, image_quality))
            
            return regions
            
        except Exception as e:
            print(f"切割图像失败: {str(e)}")
            return []
    
    def _split_image_by_dividers(self, image_data: str, divider_lines: List[dict], 
                                  drawing_elements: List[dict] = None,
                                  display_width: int = None, 
                                  display_height: int = None,
                                  image_quality: int = 85) -> List[str]:
        """
        根据分割线切割图像
        需求: 9.3, 9.4
        """
        try:
            image_bytes = self._decode_base64_image(image_data)
            if not image_bytes:
                return []
            
            img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
            img_width, img_height = img.size
            
            # 如果有绘图元素，合成到图像上
            if drawing_elements:
                img = self._composite_drawing_elements(img, drawing_elements, display_width, display_height)
            
            # 如果没有分割线，返回整个图像
            if not divider_lines:
                return [self._encode_image_to_base64(img, image_quality)]
            
            # 按Y坐标排序分割线（支持 yPosition 和 y 两种字段名）
            sorted_lines = sorted(divider_lines, key=lambda x: x.get('yPosition', x.get('y', 0)))
            
            # 计算缩放比例
            scale_x = img_width / display_width if display_width else 1
            scale_y = img_height / display_height if display_height else 1
            
            # 切割图像
            regions = []
            prev_y = 0
            
            for line in sorted_lines:
                # 支持 yPosition 和 y 两种字段名
                line_y = line.get('yPosition', line.get('y', 0))
                y = int(line_y * scale_y)
                if y > prev_y and y < img_height:
                    region = img.crop((0, prev_y, img_width, y))
                    regions.append(self._encode_image_to_base64(region, image_quality))
                    prev_y = y
            
            # 添加最后一个区域
            if prev_y < img_height:
                region = img.crop((0, prev_y, img_width, img_height))
                regions.append(self._encode_image_to_base64(region, image_quality))
            
            return regions
            
        except Exception as e:
            print(f"切割图像失败: {str(e)}")
            return []
    
    def _encode_image_to_base64(self, img, quality: int = 85) -> str:
        """
        将Pillow图像编码为Base64
        使用JPEG格式进行压缩以减小文件大小
        
        Args:
            img: Pillow图像
            quality: JPEG压缩质量 (50-100)，默认85
        """
        try:
            # 使用JPEG格式压缩，质量参数范围50-100
            quality = max(50, min(100, quality))
            buffer = io.BytesIO()
            img.convert('RGB').save(buffer, format='JPEG', quality=quality)
            base64_str = base64.b64encode(buffer.getvalue()).decode('utf-8')
            return f"data:image/jpeg;base64,{base64_str}"
        except Exception as e:
            print(f"编码图像失败: {str(e)}")
            return ""
    
    def _composite_drawing_elements(self, img, drawing_elements: List[dict],
                                     display_width: int, display_height: int):
        """
        将绘图元素合成到图像上
        需求: 9.5
        """
        if not drawing_elements:
            return img
        
        try:
            img_width, img_height = img.size
            scale_x = img_width / display_width if display_width else 1
            scale_y = img_height / display_height if display_height else 1
            draw = ImageDraw.Draw(img)
            
            for element in drawing_elements:
                element_type = element.get('type')
                
                # 获取颜色 - 支持直接color属性和style.color
                style = element.get('style', {})
                color_hex = element.get('color') or style.get('color', '#ff0000')
                color = self._hex_to_rgb(color_hex)
                thickness = max(1, int(element.get('thickness', 2) * scale_x))
                
                if element_type == 'rectangle':
                    x = int(element.get('x', 0) * scale_x)
                    y = int(element.get('y', 0) * scale_y)
                    w = int(element.get('width', 0) * scale_x)
                    h = int(element.get('height', 0) * scale_y)
                    draw.rectangle((x, y, x + w, y + h), outline=color, width=thickness)
                    
                elif element_type == 'circle':
                    cx = int(element.get('cx', 0) * scale_x)
                    cy = int(element.get('cy', 0) * scale_y)
                    r = int(element.get('radius', 0) * scale_x)
                    draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=color, width=thickness)
                    
                elif element_type == 'line':
                    x1 = int(element.get('x1', 0) * scale_x)
                    y1 = int(element.get('y1', 0) * scale_y)
                    x2 = int(element.get('x2', 0) * scale_x)
                    y2 = int(element.get('y2', 0) * scale_y)
                    draw.line((x1, y1, x2, y2), fill=color, width=thickness)
                    
                elif element_type == 'arrow':
                    x1 = int(element.get('x1', 0) * scale_x)
                    y1 = int(element.get('y1', 0) * scale_y)
                    x2 = int(element.get('x2', 0) * scale_x)
                    y2 = int(element.get('y2', 0) * scale_y)
                    draw.line((x1, y1, x2, y2), fill=color, width=thickness)
                    angle = math.atan2(y2 - y1, x2 - x1)
                    head = max(8, min(math.hypot(x2 - x1, y2 - y1) * 0.1, 24))
                    draw.polygon([
                        (x2, y2),
                        (x2 - head * math.cos(angle - math.pi / 6), y2 - head * math.sin(angle - math.pi / 6)),
                        (x2 - head * math.cos(angle + math.pi / 6), y2 - head * math.sin(angle + math.pi / 6)),
                    ], fill=color)
                    
                elif element_type == 'freehand':
                    points = element.get('points', [])
                    if len(points) >= 2:
                        pts = [(int(p['x'] * scale_x), int(p['y'] * scale_y)) for p in points]
                        draw.line(pts, fill=color, width=thickness, joint='curve')
                
                elif element_type == 'text':
                    # 使用PIL绘制文本（支持中文）
                    x = int(element.get('x', 0) * scale_x)
                    y = int(element.get('y', 0) * scale_y)
                    content = element.get('content', '')
                    # 字体大小按比例缩放，但保证最小24像素
                    base_font_size = style.get('fontSize', 24)
                    font_size = max(24, int(base_font_size * scale_x))
                    
                    # 使用PIL绘制（粗体）
                    img = self._draw_text_with_pil(img, content, x, y, font_size, color, bold=True)
                
                elif element_type == 'step':
                    # 绘制步骤标注（圆圈+数字）
                    x = int(element.get('x', 0) * scale_x)
                    y = int(element.get('y', 0) * scale_y)
                    w = int(element.get('width', 32) * scale_x)
                    h = int(element.get('height', 32) * scale_y)
                    content = element.get('content', '1')
                    
                    # 确保圆圈有最小尺寸
                    min_size = 24
                    w = max(w, min_size)
                    h = max(h, min_size)
                    
                    # 绘制圆形背景
                    center_x = x + w // 2
                    center_y = y + h // 2
                    radius = min(w, h) // 2
                    draw.ellipse((center_x - radius, center_y - radius,
                                  center_x + radius, center_y + radius), fill=color)
                    
                    # 使用PIL绘制白色数字（居中），字体大小为圆半径的1.2倍，最小16
                    font_size = max(16, int(radius * 1.2))
                    img = self._draw_step_number(img, content, center_x, center_y, font_size)
            
            return img
            
        except Exception as e:
            print(f"合成绘图元素失败: {str(e)}")
            return img
    
    def _draw_text_with_pil(self, img, text: str, x: int, y: int, font_size: int, color_rgb: Tuple[int, int, int], bold: bool = False):
        """使用PIL绘制文本（支持中文）"""
        try:
            draw = ImageDraw.Draw(img)
            
            # 确保字体大小合理
            font_size = max(16, font_size)
            
            # 尝试加载中文字体
            font = None
            font_paths = [
                # macOS 字体
                '/System/Library/Fonts/PingFang.ttc',
                '/System/Library/Fonts/STHeiti Medium.ttc',
                '/System/Library/Fonts/Hiragino Sans GB.ttc',
                '/Library/Fonts/Arial Unicode.ttf',
                # Windows 字体
                'C:/Windows/Fonts/msyh.ttc',
                'C:/Windows/Fonts/msyhbd.ttc',
                'C:/Windows/Fonts/simhei.ttf',
                'C:/Windows/Fonts/simsun.ttc',
            ]
            
            for font_path in font_paths:
                if os.path.exists(font_path):
                    try:
                        font = ImageFont.truetype(font_path, font_size)
                        break
                    except Exception as e:
                        continue
            
            if font is None:
                # 使用默认字体
                try:
                    font = ImageFont.load_default()
                except:
                    pass
            
            # 绘制文本
            if font:
                draw.text((x, y), text, font=font, fill=color_rgb)
            
            return img
            
        except Exception as e:
            print(f"PIL绘制文本失败: {str(e)}")
            return img
    
    def _draw_step_number(self, img, text: str, center_x: int, center_y: int, font_size: int):
        """绘制步骤标注数字（白色，居中）"""
        try:
            draw = ImageDraw.Draw(img)
            
            # 确保字体大小合理
            font_size = max(14, font_size)
            
            # 使用中文字体
            font = None
            font_paths = [
                '/System/Library/Fonts/PingFang.ttc',
                '/System/Library/Fonts/STHeiti Medium.ttc',
                '/Library/Fonts/Arial Unicode.ttf',
                'C:/Windows/Fonts/msyh.ttc',
                'C:/Windows/Fonts/msyhbd.ttc',
                'C:/Windows/Fonts/arialbd.ttf',
            ]
            
            for font_path in font_paths:
                if os.path.exists(font_path):
                    try:
                        font = ImageFont.truetype(font_path, font_size)
                        break
                    except:
                        continue
            
            if font is None:
                font = ImageFont.load_default()
            
            # 计算文本边界框以居中
            bbox = draw.textbbox((0, 0), text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            
            x = center_x - text_width // 2
            y = center_y - text_height // 2
            
            # 绘制白色文本
            draw.text((x, y), text, font=font, fill=(255, 255, 255))
            
            return img
            
        except Exception as e:
            print(f"绘制步骤数字失败: {str(e)}")
            return img
    
    def _hex_to_rgb(self, hex_color: str) -> Tuple[int, int, int]:
        """将HEX颜色转换为RGB格式"""
        try:
            hex_color = hex_color.lstrip('#')
            if len(hex_color) == 6:
                r = int(hex_color[0:2], 16)
                g = int(hex_color[2:4], 16)
                b = int(hex_color[4:6], 16)
                return (r, g, b)
        except:
            pass
        return (255, 0, 0)  # 默认红色
    
# 创建全局导出服务实例
export_service = ExportService()
