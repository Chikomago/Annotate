"""
统计数据API
管理项目完成状态统计
"""

from flask import Blueprint, request, jsonify
import json
import os
from datetime import datetime

statistics_bp = Blueprint('statistics', __name__)

# 统计数据文件路径
STATISTICS_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'statistics.json')

def ensure_statistics_file():
    """确保统计文件存在"""
    os.makedirs(os.path.dirname(STATISTICS_FILE), exist_ok=True)
    if not os.path.exists(STATISTICS_FILE):
        with open(STATISTICS_FILE, 'w', encoding='utf-8') as f:
            json.dump({'records': []}, f, ensure_ascii=False, indent=2)

def load_statistics():
    """加载统计数据"""
    ensure_statistics_file()
    try:
        with open(STATISTICS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return {'records': []}

def save_statistics(data):
    """保存统计数据"""
    ensure_statistics_file()
    with open(STATISTICS_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

@statistics_bp.route('/api/statistics', methods=['GET'])
def get_statistics():
    """获取统计数据"""
    try:
        # 获取时间范围参数
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        data = load_statistics()
        records = data.get('records', [])
        
        # 如果没有指定时间范围，默认当前月
        if not start_date or not end_date:
            now = datetime.now()
            start_date = now.strftime('%Y-%m-01')
            # 获取当月最后一天
            if now.month == 12:
                end_date = f'{now.year + 1}-01-01'
            else:
                end_date = f'{now.year}-{now.month + 1:02d}-01'
        
        # 过滤时间范围内的记录
        filtered_records = []
        for record in records:
            record_date = record.get('date', '')[:10]
            if start_date <= record_date < end_date:
                filtered_records.append(record)
        
        # 统计数量
        completed_count = sum(1 for r in filtered_records if r.get('status') == 'completed')
        pending_count = sum(1 for r in filtered_records if r.get('status') == 'pending')
        
        return jsonify({
            'success': True,
            'data': {
                'records': filtered_records,
                'summary': {
                    'completed': completed_count,
                    'pending': pending_count,
                    'total': completed_count + pending_count
                },
                'dateRange': {
                    'start': start_date,
                    'end': end_date
                }
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@statistics_bp.route('/api/statistics/record', methods=['POST'])
def add_record():
    """添加统计记录"""
    try:
        req_data = request.get_json()
        project_id = req_data.get('projectId')
        project_name = req_data.get('projectName')
        status = req_data.get('status')  # 'completed' 或 'pending'
        workload = req_data.get('workload', '')
        company = req_data.get('company', '')
        template_id = req_data.get('templateId', '')
        
        if not project_id or not status:
            return jsonify({'success': False, 'message': '缺少必要参数'}), 400
        
        data = load_statistics()
        records = data.get('records', [])
        
        # 检查是否已存在该项目的记录
        existing_index = None
        for i, record in enumerate(records):
            if record.get('projectId') == project_id:
                existing_index = i
                break
        
        new_record = {
            'id': f'stat_{datetime.now().strftime("%Y%m%d%H%M%S")}_{project_id}',
            'projectId': project_id,
            'projectName': project_name or '未命名项目',
            'status': status,
            'workload': workload,
            'company': company,
            'templateId': template_id,
            'date': datetime.now().isoformat()
        }
        
        if existing_index is not None:
            # 更新现有记录
            records[existing_index] = new_record
        else:
            # 添加新记录
            records.append(new_record)
        
        data['records'] = records
        save_statistics(data)
        
        return jsonify({'success': True, 'record': new_record})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@statistics_bp.route('/api/statistics/record/<record_id>', methods=['DELETE'])
def delete_record(record_id):
    """删除统计记录"""
    try:
        data = load_statistics()
        records = data.get('records', [])
        
        # 查找并删除记录
        new_records = [r for r in records if r.get('id') != record_id]
        
        if len(new_records) == len(records):
            return jsonify({'success': False, 'message': '记录不存在'}), 404
        
        data['records'] = new_records
        save_statistics(data)
        
        return jsonify({'success': True, 'message': '删除成功'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@statistics_bp.route('/api/statistics/record/<record_id>', methods=['PUT'])
def update_record(record_id):
    """更新统计记录"""
    try:
        req_data = request.get_json()
        data = load_statistics()
        records = data.get('records', [])
        
        # 查找并更新记录
        found = False
        for i, record in enumerate(records):
            if record.get('id') == record_id:
                records[i].update({
                    'projectName': req_data.get('projectName', record.get('projectName')),
                    'status': req_data.get('status', record.get('status')),
                    'workload': req_data.get('workload', record.get('workload', '')),
                    'company': req_data.get('company', record.get('company', '')),
                    'templateId': req_data.get('templateId', record.get('templateId', '')),
                    'date': req_data.get('date', record.get('date'))
                })
                found = True
                break
        
        if not found:
            return jsonify({'success': False, 'message': '记录不存在'}), 404
        
        data['records'] = records
        save_statistics(data)
        
        return jsonify({'success': True, 'message': '更新成功'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@statistics_bp.route('/api/statistics/by-project/<project_id>', methods=['DELETE'])
def delete_by_project(project_id):
    """根据项目ID删除统计记录"""
    try:
        data = load_statistics()
        records = data.get('records', [])
        
        # 删除该项目的所有记录
        new_records = [r for r in records if r.get('projectId') != project_id]
        
        data['records'] = new_records
        save_statistics(data)
        
        return jsonify({'success': True, 'message': '删除成功'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500
