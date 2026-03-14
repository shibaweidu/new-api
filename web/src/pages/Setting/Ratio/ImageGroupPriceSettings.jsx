/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { IconDelete, IconEdit, IconPlus, IconSave } from '@douyinfe/semi-icons';
import { API, showError, showSuccess } from '../../../helpers';
import { useTranslation } from 'react-i18next';

const DEFAULT_GROUP = 'default';
const CUSTOM_SIZE_VALUE = '__custom__';
const SIZE_PRESETS = [
  { label: '0.5K', value: '512x512' },
  { label: '1K', value: '1024x1024' },
  { label: '2K', value: '2048x2048' },
  { label: '4K', value: '4096x4096' },
];

const PRESET_MAP = Object.fromEntries(
  SIZE_PRESETS.map((item) => [item.value, item.label]),
);

const createEmptyForm = () => ({
  group: '',
  model: '',
  sizePreset: '1024x1024',
  customSize: '',
  price: undefined,
});

const normalizeValue = (value) => String(value || '').trim();
const normalizeSize = (value) => normalizeValue(value).toLowerCase() || '1024x1024';
const formatSizeLabel = (size, customLabel = '自定义') => {
  const normalized = normalizeSize(size);
  const presetLabel = PRESET_MAP[normalized];
  return presetLabel ? presetLabel : `${customLabel} (${normalized})`;
};

export default function ImageGroupPriceSettings(props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [form, setForm] = useState(createEmptyForm());
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    try {
      const raw = JSON.parse(props.options.GroupImageModelPrice || '{}');
      const nextRows = [];
      Object.entries(raw).forEach(([group, modelMap]) => {
        Object.entries(modelMap || {}).forEach(([model, sizeMap]) => {
          Object.entries(sizeMap || {}).forEach(([size, price]) => {
            nextRows.push({
              key: `${group}__${model}__${size}`,
              group,
              model,
              size,
              price,
            });
          });
        });
      });
      nextRows.sort((a, b) =>
        `${a.group}/${a.model}/${a.size}`.localeCompare(
          `${b.group}/${b.model}/${b.size}`,
        ),
      );
      setRows(nextRows);
    } catch (error) {
      console.error('JSON parse error:', error);
      showError(t('图片分组价格配置解析失败'));
    }
  }, [props.options.GroupImageModelPrice, t]);

  const groups = useMemo(() => {
    const groupSet = new Set([DEFAULT_GROUP]);
    try {
      const groupRatio = JSON.parse(props.options.GroupRatio || '{}');
      Object.keys(groupRatio).forEach((group) => groupSet.add(group));
    } catch (error) {
      console.error('GroupRatio parse error:', error);
    }
    rows.forEach((row) => groupSet.add(row.group));
    return Array.from(groupSet);
  }, [props.options.GroupRatio, rows]);

  const filteredRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) =>
      [row.group, row.model, row.size].some((value) =>
        String(value).toLowerCase().includes(keyword),
      ),
    );
  }, [rows, searchText]);

  const openCreateModal = (group = '') => {
    setEditingKey(null);
    setForm({ ...createEmptyForm(), group });
    setVisible(true);
  };

  const openEditModal = (record) => {
    const normalizedSize = normalizeSize(record.size);
    const isPreset = Boolean(PRESET_MAP[normalizedSize]);
    setEditingKey(record.key);
    setForm({
      group: record.group,
      model: record.model,
      sizePreset: isPreset ? normalizedSize : CUSTOM_SIZE_VALUE,
      customSize: isPreset ? '' : normalizedSize,
      price: record.price,
    });
    setVisible(true);
  };

  const closeModal = () => {
    setVisible(false);
    setEditingKey(null);
    setForm(createEmptyForm());
  };

  const upsertRow = () => {
    const group = normalizeValue(form.group);
    const model = normalizeValue(form.model);
    const customSize = normalizeValue(form.customSize);
    if (form.sizePreset === CUSTOM_SIZE_VALUE && !customSize) {
      showError(t('请输入自定义尺寸'));
      return;
    }
    const size = normalizeSize(
      form.sizePreset === CUSTOM_SIZE_VALUE ? customSize : form.sizePreset,
    );
    const price = Number(form.price);

    if (!group || !model || !size) {
      showError(t('请填写分组、模型和尺寸档位'));
      return;
    }
    if (Number.isNaN(price) || price < 0) {
      showError(t('请输入大于等于 0 的价格'));
      return;
    }

    const rowKey = `${group}__${model}__${size}`;
    const duplicate = rows.some(
      (row) => row.key === rowKey && row.key !== editingKey,
    );
    if (duplicate) {
      showError(t('该分组下相同模型与尺寸档位的价格已存在'));
      return;
    }

    const nextRow = { key: rowKey, group, model, size, price };
    setRows((prev) => {
      const filtered = prev.filter((row) => row.key !== editingKey);
      return [...filtered, nextRow].sort((a, b) =>
        `${a.group}/${a.model}/${a.size}`.localeCompare(
          `${b.group}/${b.model}/${b.size}`,
        ),
      );
    });
    closeModal();
  };

  const deleteRow = (key) => {
    setRows((prev) => prev.filter((row) => row.key !== key));
  };

  const saveRows = async () => {
    const payload = {};
    rows.forEach((row) => {
      if (!payload[row.group]) payload[row.group] = {};
      if (!payload[row.group][row.model]) payload[row.group][row.model] = {};
      payload[row.group][row.model][row.size] = Number(row.price);
    });

    setLoading(true);
    try {
      const res = await API.put('/api/option/', {
        key: 'GroupImageModelPrice',
        value: JSON.stringify(payload, null, 2),
      });
      if (!res.data.success) {
        showError(res.data.message);
        return;
      }
      showSuccess(t('保存成功'));
      props.refresh();
    } catch (error) {
      console.error('Save failed:', error);
      showError(t('保存失败，请重试'));
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: t('分组'),
      dataIndex: 'group',
      key: 'group',
      render: (text) => (
        <Tag color={text === DEFAULT_GROUP ? 'blue' : 'grey'}>{text}</Tag>
      ),
    },
    {
      title: t('图像模型'),
      dataIndex: 'model',
      key: 'model',
    },
    {
      title: t('尺寸档位'),
      dataIndex: 'size',
      key: 'size',
      render: (text) => formatSizeLabel(text, t('自定义')),
    },
    {
      title: t('单次价格'),
      dataIndex: 'price',
      key: 'price',
    },
    {
      title: t('操作'),
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button icon={<IconEdit />} onClick={() => openEditModal(record)} />
          <Button
            type='danger'
            icon={<IconDelete />}
            onClick={() => deleteRow(record.key)}
          />
        </Space>
      ),
    },
  ];

  return (
    <Space vertical align='start' style={{ width: '100%' }}>
      <Typography.Text>
        {t(
          '为同一个图像模型在不同分组下按尺寸档位设置按次价格。宽高比例由模型自动识别，命中后将按次扣费。',
        )}
      </Typography.Text>
      <Space wrap>
        <Button icon={<IconPlus />} onClick={() => openCreateModal()}>
          {t('新增尺寸价格')}
        </Button>
        <Button
          type='primary'
          icon={<IconSave />}
          loading={loading}
          onClick={saveRows}
        >
          {t('保存图片分组价格')}
        </Button>
        <Input
          showClear
          value={searchText}
          onChange={setSearchText}
          placeholder={t('搜索分组 / 模型 / 尺寸档位')}
          style={{ width: 260 }}
        />
      </Space>
      <Space wrap>
        {groups.map((group) => (
          <Tag key={group} onClick={() => openCreateModal(group)}>
            {group}
          </Tag>
        ))}
      </Space>
      <Table columns={columns} dataSource={filteredRows} pagination={false} />

      <Modal
        title={editingKey ? t('编辑图片价格') : t('新增图片价格')}
        visible={visible}
        onCancel={closeModal}
        onOk={upsertRow}
      >
        <Space vertical style={{ width: '100%' }}>
          <Input
            value={form.group}
            placeholder={t('分组，例如 default 或 vip')}
            onChange={(value) => setForm((prev) => ({ ...prev, group: value }))}
          />
          <Input
            value={form.model}
            placeholder={t('图像模型，例如 gpt-image-1')}
            onChange={(value) => setForm((prev) => ({ ...prev, model: value }))}
          />
          <Select
            value={form.sizePreset}
            optionList={SIZE_PRESETS.map((item) => ({
              label: `${item.label} (${item.value})`,
              value: item.value,
            })).concat([
              {
                label: t('自定义尺寸'),
                value: CUSTOM_SIZE_VALUE,
              },
            ])}
            placeholder={t('选择尺寸档位')}
            onChange={(value) =>
              setForm((prev) => ({ ...prev, sizePreset: value }))
            }
          />
          {form.sizePreset === CUSTOM_SIZE_VALUE && (
            <Input
              value={form.customSize}
              placeholder={t('输入自定义尺寸标识，例如 1536x1024')}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, customSize: value }))
              }
            />
          )}
          <InputNumber
            value={form.price}
            min={0}
            precision={6}
            placeholder={t('单次价格')}
            onChange={(value) => setForm((prev) => ({ ...prev, price: value }))}
            style={{ width: '100%' }}
          />
          <Typography.Text type='tertiary'>
            {t('预设尺寸档位：0.5K、1K、2K、4K。实际宽高比例由模型自动识别。')}
          </Typography.Text>
        </Space>
      </Modal>
    </Space>
  );
}
