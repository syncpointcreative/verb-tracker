'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Client { id: string; name: string; slug: string; color_hex: string }
interface Product { id: string; client_id: string; name: string; sort_order: number }
interface Delivery { id: string; client_id: string; month: string; delivered: number; quota: number; client?: Client }
interface Asset {
  id: string; client_id: string; product_id: string; stage: string
  asset_name: string; content_type: string | null; file_name: string | null
  status: string; date_added: string | null; posted_by: string | null; notes: string | null
}

const STAGES = ['Awareness', 'Consideration', 'Conversion']
const STATUSES = ['Ready to Upload', 'Live / Running', 'Expired', 'Needs Refresh / Missing']

function fmt(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminPage() {
  const [clients, setClients]       = useState<Client[]>([])
  const [products, setProducts]     = useState<Product[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [assets, setAssets]         = useState<Asset[]>([])
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState<'deliveries' | 'assets' | 'add'>('deliveries')
  const [saving, setSaving]         = useState<string | null>(null)
  const [toast, setToast]           = useState<string | null>(null)
  const [syncing, setSyncing]       = useState(false)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const [c, d, a] = await Promise.all([
      fetch('/api/assets?_clients=1').then(() => fetch('/api/assets')),
      fetch('/api/deliveries').then(r => r.json()),
      fetch('/api/assets').then(r => r.json()),
    ])
    // Fetch clients and products from Supabase via a quick API call
    const clientRes  = await fetch('/api/clients').then(r => r.json()).catch(() => [])
    const productRes = await fetch('/api/products').then(r => r.json()).catch(() => [])
    setClients(Array.isArray(clientRes) ? clientRes : [])
    setProducts(Array.isArray(productRes) ? productRes : [])
    setDeliveries(Array.isArray(d) ? d : [])
    setAssets(Array.isArray(a) ? a : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Delivery update ──────────────────────────────────────────────────────────
  const updateDelivery = async (id: string, field: 'delivered' | 'quota', value: number) => {
    setSaving(id + field)
    await fetch(`/api/deliveries?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    setSaving(null)
    showToast('Saved ✓')
    setDeliveries(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d))
  }

  const syncDeliveries = async () => {
    setSyncing(true)
    try {
      const now = new Date()
      const res = await fetch('/api/deliveries/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: now.getFullYear(), month: now.getMonth() + 1 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(data.message ?? 'Sync complete ✓')
      load()
    } catch (err) {
      showToast('Sync failed — check console')
      console.error(err)
    } finally {
      setSyncing(false)
    }
  }

  const addDeliveryMonth = async (clientId: string, month: string) => {
    await fetch('/api/deliveries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, month, delivered: 0, quota: 30 }),
    })
    showToast('Month added ✓')
    load()
  }

  // ── Asset status update ──────────────────────────────────────────────────────
  const updateAsset = async (id: string, field: string, value: string) => {
    setSaving(id + field)
    await fetch(`/api/assets?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    setSaving(null)
    showToast('Saved ✓')
    setAssets(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a))
  }

  const deleteAsset = async (id: string) => {
    if (!confirm('Delete this asset?')) return
    await fetch(`/api/assets?id=${id}`, { method: 'DELETE' })
    showToast('Deleted ✓')
    setAssets(prev => prev.filter(a => a.id !== id))
  }

  // ── Add asset form ────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    client_id: '', product_id: '', stage: 'Awareness', asset_name: '',
    content_type: '', file_name: '', status: 'Ready to Upload',
    date_added: new Date().toISOString().split('T')[0], posted_by: '', notes: '',
  })

  const clientProducts = products.filter(p => p.client_id === form.client_id)
    .sort((a, b) => a.sort_order - b.sort_order)

  const submitAsset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.client_id || !form.product_id || !form.asset_name) {
      showToast('Client, product, and asset name are required')
      return
    }
    setSaving('add')
    const res = await fetch('/api/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        content_type: form.content_type || null,
        file_name: form.file_name || null,
        posted_by: form.posted_by || null,
        notes: form.notes || null,
      }),
    })
    setSaving(null)
    if (res.ok) {
      showToast('Asset added ✓')
      setForm(f => ({ ...f, asset_name: '', file_name: '', notes: '', posted_by: '' }))
      load()
    } else {
      showToast('Error — check console')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
  )

  // Group deliveries by month
  const deliveriesByMonth: Record<string, Delivery[]> = {}
  for (const d of deliveries) {
    const key = d.month.slice(0, 7)
    if (!deliveriesByMonth[key]) deliveriesByMonth[key] = []
    deliveriesByMonth[key].push(d)
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manually update delivery counts, asset statuses, and add new assets</p>
        </div>
        <Link href="/" className="text-sm text-blue-600 hover:underline">← Dashboard</Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {([['deliveries', 'Monthly Deliveries'], ['assets', 'Asset Status'], ['add', 'Add Asset']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB: Monthly Deliveries ────────────────────────────────────────────── */}
      {tab === 'deliveries' && (
        <div className="space-y-6">
          {/* Sync banner */}
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-blue-800">Sync from Assets Table</p>
              <p className="text-xs text-blue-600 mt-0.5">
                Counts all assets with a date in the current month and updates delivered numbers.
                Run this every Monday — assets removed from the table won&apos;t be counted.
              </p>
            </div>
            <button
              onClick={syncDeliveries}
              disabled={syncing}
              className="ml-4 shrink-0 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {syncing ? 'Syncing…' : '↻ Sync This Month'}
            </button>
          </div>

          {Object.entries(deliveriesByMonth)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([month, rows]) => (
            <div key={month}>
              <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">
                {fmt(month + '-01')}
              </h2>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-4 py-2.5">Client</th>
                      <th className="text-center px-4 py-2.5 w-36">Delivered</th>
                      <th className="text-center px-4 py-2.5 w-36">Quota</th>
                      <th className="text-center px-4 py-2.5 w-24">Progress</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map(d => {
                      const pct = Math.min(100, (d.delivered / d.quota) * 100)
                      const met = d.delivered >= d.quota
                      return (
                        <tr key={d.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-800">
                            {clients.find(c => c.id === d.client_id)?.name ?? d.client_id}
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min={0}
                              defaultValue={d.delivered}
                              onBlur={e => {
                                const v = parseInt(e.target.value)
                                if (!isNaN(v) && v !== d.delivered) updateDelivery(d.id, 'delivered', v)
                              }}
                              disabled={saving === d.id + 'delivered'}
                              className="w-full text-center border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min={1}
                              defaultValue={d.quota}
                              onBlur={e => {
                                const v = parseInt(e.target.value)
                                if (!isNaN(v) && v !== d.quota) updateDelivery(d.id, 'quota', v)
                              }}
                              disabled={saving === d.id + 'quota'}
                              className="w-full text-center border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                                <div className={`h-1.5 rounded-full ${met ? 'bg-green-500' : 'bg-blue-400'}`} style={{ width: `${pct}%` }} />
                              </div>
                              <span className={`text-xs font-semibold w-12 text-right ${met ? 'text-green-700' : 'text-gray-600'}`}>
                                {d.delivered}/{d.quota}
                              </span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Add new month */}
          <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-600 mb-3">Add a month for a client</p>
            <form
              onSubmit={e => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                addDeliveryMonth(fd.get('client_id') as string, fd.get('month') as string)
                ;(e.target as HTMLFormElement).reset()
              }}
              className="flex gap-3 items-end flex-wrap"
            >
              <div>
                <label className="text-xs text-gray-500 block mb-1">Client</label>
                <select name="client_id" required className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select…</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Month (first day)</label>
                <input type="date" name="month" required className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button type="submit" className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700">
                Add Month
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── TAB: Asset Status ─────────────────────────────────────────────────── */}
      {tab === 'assets' && (
        <div>
          {clients.map(client => {
            const clientAssets = assets.filter(a => a.client_id === client.id)
            if (!clientAssets.length) return null
            return (
              <div key={client.id} className="mb-8">
                <h2 className="font-semibold text-gray-800 mb-2" style={{ color: client.color_hex }}>
                  {client.name}
                </h2>
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                        <th className="text-left px-4 py-2.5">Asset</th>
                        <th className="text-left px-4 py-2.5 w-28">Stage</th>
                        <th className="text-left px-4 py-2.5 w-44">Status</th>
                        <th className="text-left px-4 py-2.5 w-32">Date Added</th>
                        <th className="px-4 py-2.5 w-16"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {clientAssets.map(asset => (
                        <tr key={asset.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-gray-800">
                            <input
                              type="text"
                              defaultValue={asset.asset_name}
                              onBlur={e => {
                                const v = e.target.value.trim()
                                if (v && v !== asset.asset_name) updateAsset(asset.id, 'asset_name', v)
                              }}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                              className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-400 focus:outline-none py-0.5 text-sm text-gray-800 font-medium"
                            />
                            {asset.file_name && <div className="text-xs text-gray-400 font-mono mt-0.5">{asset.file_name}</div>}
                          </td>
                          <td className="px-4 py-2.5">
                            <select
                              defaultValue={asset.stage}
                              onChange={e => updateAsset(asset.id, 'stage', e.target.value)}
                              className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              {STAGES.map(s => <option key={s}>{s}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-2.5">
                            <select
                              defaultValue={asset.status}
                              onChange={e => updateAsset(asset.id, 'status', e.target.value)}
                              className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
                            >
                              {STATUSES.map(s => <option key={s}>{s}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              type="date"
                              defaultValue={asset.date_added ?? ''}
                              onBlur={e => { if (e.target.value) updateAsset(asset.id, 'date_added', e.target.value) }}
                              className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <button
                              onClick={() => deleteAsset(asset.id)}
                              className="text-red-400 hover:text-red-600 text-xs font-medium"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
          {assets.length === 0 && (
            <div className="text-center text-gray-400 py-12">No assets yet — add some in the Add Asset tab</div>
          )}
        </div>
      )}

      {/* ── TAB: Add Asset ────────────────────────────────────────────────────── */}
      {tab === 'add' && (
        <form onSubmit={submitAsset} className="bg-white border border-gray-200 rounded-xl p-6 space-y-4 max-w-2xl">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
              <select
                value={form.client_id}
                onChange={e => setForm(f => ({ ...f, client_id: e.target.value, product_id: '' }))}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select client…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product *</label>
              <select
                value={form.product_id}
                onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}
                required
                disabled={!form.client_id}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              >
                <option value="">Select product…</option>
                {clientProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Asset Name *</label>
            <input
              type="text"
              value={form.asset_name}
              onChange={e => setForm(f => ({ ...f, asset_name: e.target.value }))}
              placeholder="e.g. APW Hook Video — Kitchen Demo"
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Funnel Stage *</label>
              <select
                value={form.stage}
                onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {STAGES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Content Type</label>
              <select
                value={form.content_type}
                onChange={e => setForm(f => ({ ...f, content_type: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select…</option>
                {['UGC','Brand / Lifestyle','Product Demo','Creator-Led','Testimonial / Review','Tutorial / How-To','Trend-Led','Promotional','Static Imagery','Motion Graphics','Affiliate Video'].map(t => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date Added</label>
              <input
                type="date"
                value={form.date_added}
                onChange={e => setForm(f => ({ ...f, date_added: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">File Name</label>
              <input
                type="text"
                value={form.file_name}
                onChange={e => setForm(f => ({ ...f, file_name: e.target.value }))}
                placeholder="BIOM-APW-UGC-DB-040726.mp4"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Posted By</label>
              <input
                type="text"
                value={form.posted_by}
                onChange={e => setForm(f => ({ ...f, posted_by: e.target.value }))}
                placeholder="Creator name"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Any additional context…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={saving === 'add'}
            className="w-full bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {saving === 'add' ? 'Adding…' : 'Add Asset'}
          </button>
        </form>
      )}
    </div>
  )
}
