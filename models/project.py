"""
项目数据模型
"""
from dataclasses import dataclass, field
from typing import List, Optional
from datetime import datetime

@dataclass
class ElementStyle:
    """绘制元素样式"""
    color: str = '#000000'
    fontSize: Optional[int] = None
    fontFamily: Optional[str] = None
    fontWeight: Optional[str] = None
    borderWidth: Optional[int] = None

@dataclass
class DrawingElement:
    """绘制元素"""
    id: str
    type: str  # 'rectangle' | 'text' | 'step'
    x: float
    y: float
    width: float
    height: float
    style: ElementStyle = field(default_factory=ElementStyle)
    content: Optional[str] = None

@dataclass
class DividerLine:
    """分割线"""
    id: str
    yPosition: float

@dataclass
class TextBox:
    """富文本框"""
    id: str
    regionId: str
    content: str  # HTML内容
    height: float

@dataclass
class Project:
    """标注项目"""
    id: str
    name: str
    userId: str
    imageData: Optional[str] = None  # Base64编码的图像
    drawingElements: List[DrawingElement] = field(default_factory=list)
    dividerLines: List[DividerLine] = field(default_factory=list)
    textBoxes: List[TextBox] = field(default_factory=list)
    createdAt: datetime = field(default_factory=datetime.now)
    updatedAt: datetime = field(default_factory=datetime.now)
