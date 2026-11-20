import { inputClass } from './ui'

const HTML_TYPE = { TEXT: 'text', NUMBER: 'number', DATE: 'date' }

// Renders a category's extra form fields. `values` is { field_key: value }.
export default function DynamicFields({ fields, values, onChange }) {
  const set = (key) => (e) => onChange({ ...values, [key]: e.target.value })

  return fields.map((f) => (
    <label key={f.id} className="block text-sm font-medium">
      {f.label}
      {f.is_required && <span className="text-red-600"> *</span>}
      {f.field_type === 'SELECT' ? (
        <select required={f.is_required} value={values[f.field_key] ?? ''} onChange={set(f.field_key)} className={inputClass}>
          <option value="">Choose…</option>
          {f.options.map((o) => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={HTML_TYPE[f.field_type]}
          step={f.field_type === 'NUMBER' ? 'any' : undefined}
          required={f.is_required}
          value={values[f.field_key] ?? ''}
          onChange={set(f.field_key)}
          className={inputClass}
        />
      )}
    </label>
  ))
}
