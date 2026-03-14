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
const ORIENTATION_OPTIONS = [
  { label: '竖屏', value: '720x1280' },
  { label: '横屏', value: '1280x720' },
];
const DURATION_OPTIONS = [4, 8, 12];

const createEmptyForm = () => ({
  group: DEFAULT_GROUP,
  model: 'sora-2',
  orientation: '720x1280',
  duration: 4,
  price: undefined,
});

const formatVariant = (duration, orientation) => `${duration}s_${orientation}`;

const parseVariant = (variant) => {
  const [durationPart = '4s', orientation = '720x1280'] = String(variant || '').split('_');
  const duration = Number.parseInt(durationPart, 10) || 4;
  return { duration, orientation };
};

export default function TaskGroupPriceSettings(props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [form, setForm] = useState(createEmptyForm());
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    try {
      const raw = JSON.parse(props.options.GroupTaskModelPrice || '{}');
      const nextRows = [];
      Object.entries(raw).forEach(([group, modelMap]) => {
        Object.entries(modelMap || {}).forEach(([model, variantMap]) => {
          Object.entries(variantMap || {}).forEach(([variant, price]) => {
            const { duration, orientation } = parseVariant(variant);
            nextRows.push({
              key: `${group}__${model}__${variant}`,
              group,
              model,
              variant,
              duration,
              orientation,
              price,
            });
          });
        });
      });
      nextRows.sort((a, b) =>
        `${a.group}/${a.model}/${a.variant}`.localeCompare(
          `${b.group}/${b.model}/${b.variant}`,
        ),
      );
      setRows(nextRows);
    } catch (error) {
      console.error('JSON parse error:', error);
      showError(t('任务分组价格配置解析失败'));
    }
  }, [props.options.GroupTaskModelPrice, t]);

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
      [row.group, row.model, row.orientation, `${row.duration}s`].some((value) =>
        String(value).toLowerCase().includes(keyword),
      ),
    );
  }, [rows, searchText]);

  const openCreateModal = (group = DEFAULT_GROUP) => {
    setEditingKey(null);
    setForm({ ...createEmptyForm(), group });
    setVisible(true);
  };

  const openEditModal = (record) => {
    setEditingKey(record.key);
    setForm({
      group: record.group,
      model: record.model,
      orientation: record.orientation,
      duration: record.duration,
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
    const group = String(form.group || '').trim();
    const model = String(form.model || '').trim();
    const orientation = String(form.orientation || '').trim();
    const duration = Number(form.duration);
    const price = Number(form.price);

    if (!group || !model || !orientation || !duration) {
      showError(t('请填写分组、模型、画幅和时长'));
      return;
    }
    if (Number.isNaN(price) || price < 0) {
      showError(t('请输入大于等于 0 的价格'));
      return;
    }

    const variant = formatVariant(duration, orientation);
    const rowKey = `${group}__${model}__${variant}`;
    const duplicate = rows.some(
      (row) => row.key === rowKey && row.key !== editingKey,
    );
    if (duplicate) {
      showError(t('该分组下相同模型、画幅和时长的价格已存在'));
      return;
    }

    const nextRow = {
      key: rowKey,
      group,
      model,
      variant,
      duration,
      orientation,
      price,
    };
    setRows((prev) => {
      const filtered = prev.filter((row) => row.key !== editingKey);
      return [...filtered, nextRow].sort((a, b) =>
        `${a.group}/${a.model}/${a.variant}`.localeCompare(
          `${b.group}/${b.model}/${b.variant}`,
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
      payload[row.group][row.model][row.variant] = Number(row.price);
    });

    setLoading(true);
    try {
      const res = await API.put('/api/option/', {
        key: 'GroupTaskModelPrice',
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
      title: t('任务模型'),
      dataIndex: 'model',
      key: 'model',
    },
    {
      title: t('画幅'),
      dataIndex: 'orientation',
      key: 'orientation',
      render: (value) =>
        value === '1280x720'
          ? `${t('横屏')} (1280x720)`
          : `${t('竖屏')} (720x1280)`,
    },
    {
      title: t('时长'),
      dataIndex: 'duration',
      key: 'duration',
      render: (value) => `${value}s`,
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
          '为视频任务模型设置按时间计费价格。以 sora-2 为主，分辨率固定，支持横屏和竖屏，时长支持 4s、8s、12s。参考图上传后会自动适配到所选分辨率，优先保留完整内容。该功能为补充功能，不影响原有按量或按次计费方式。',
        )}
      </Typography.Text>
      <Space wrap>
        <Button icon={<IconPlus />} onClick={() => openCreateModal()}>
          {t('新增任务价格')}
        </Button>
        <Button
          type='primary'
          icon={<IconSave />}
          loading={loading}
          onClick={saveRows}
        >
          {t('保存任务分组价格')}
        </Button>
        <Input
          showClear
          value={searchText}
          onChange={setSearchText}
          placeholder={t('搜索分组 / 模型 / 画幅 / 时长')}
          style={{ width: 280 }}
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
        title={editingKey ? t('编辑任务价格') : t('新增任务价格')}
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
            placeholder={t('任务模型，例如 sora-2')}
            onChange={(value) => setForm((prev) => ({ ...prev, model: value }))}
          />
          <Select
            value={form.orientation}
            optionList={ORIENTATION_OPTIONS.map((item) => ({
              label: `${t(item.label)} (${item.value})`,
              value: item.value,
            }))}
            placeholder={t('选择画幅')}
            onChange={(value) =>
              setForm((prev) => ({ ...prev, orientation: value }))
            }
          />
          <Select
            value={form.duration}
            optionList={DURATION_OPTIONS.map((item) => ({
              label: `${item}s`,
              value: item,
            }))}
            placeholder={t('选择时长')}
            onChange={(value) => setForm((prev) => ({ ...prev, duration: value }))}
          />
          <InputNumber
            value={form.price}
            min={0}
            precision={6}
            placeholder={t('单次价格')}
            onChange={(value) => setForm((prev) => ({ ...prev, price: value }))}
            style={{ width: '100%' }}
          />
          <Typography.Text type='tertiary'>
            {t('当前设计限定 sora-2 使用固定分辨率：竖屏 720x1280、横屏 1280x720。参考图会自动补边适配到所选分辨率。')}
          </Typography.Text>
        </Space>
      </Modal>
    </Space>
  );
}
