import React from 'react';
import {
  Users,
  Plus,
  Search,
  Edit2,
  Trash2,
  Video,
  Image,
  QrCode,
  Eye,
  ToggleLeft,
  ToggleRight,
  X,
  Check,
  Loader,
  Download,
  ExternalLink,
  Camera,
  Upload,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

// ─── Types ───────────────────────────────────────────────────────────────────

interface QRProfile {
  id: string;
  name: string;
  title: string | null;
  role_type: 'sales_rep' | 'manager' | 'admin';
  email: string | null;
  phone_number: string | null;
  bio: string | null;
  start_year: number | null;
  slug: string;
  image_url: string | null;
  is_active: boolean;
  is_claimed: boolean;
  qr_scan_count: number;
  created_at: string;
}

interface ProfileVideo {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  is_welcome_video: boolean;
  created_at: string;
}

interface FeatureStatus {
  total_profiles: number;
  active_profiles: number;
  claimed_profiles: number;
  total_scans: number;
  feature_enabled: boolean;
}

interface AdminQRProfilesPanelProps {
  userEmail: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function parseCSV(raw: string): Array<Record<string, string>> {
  const lines = raw.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ''; });
    return obj;
  });
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error';
}

function useToasts() {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const add = React.useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);
  return { toasts, add };
}

function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => (
        <div
          key={t.id}
          style={{
            background: t.type === 'success' ? '#166534' : '#7f1d1d',
            border: `1px solid ${t.type === 'success' ? '#16a34a' : '#dc2626'}`,
            color: '#fff',
            padding: '10px 16px',
            borderRadius: 8,
            fontSize: 14,
            minWidth: 240,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {t.type === 'success' ? <Check size={14} /> : <X size={14} />}
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div style={{
      background: '#0a0a0a',
      border: '1px solid #262626',
      borderRadius: 12,
      padding: '1rem 1.25rem',
      flex: 1,
      minWidth: 120,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#71717a', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {icon}
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: '#fff' }}>{value}</div>
    </div>
  );
}

// ─── Modal Wrapper ────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, maxWidth = 600 }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: number;
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#171717',
        border: '1px solid #262626',
        borderRadius: 12,
        width: '100%',
        maxWidth,
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#71717a', padding: 4, display: 'flex', alignItems: 'center',
              minWidth: 44, minHeight: 44, justifyContent: 'center', borderRadius: 8,
            }}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Field Input ──────────────────────────────────────────────────────────────

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#a1a1aa',
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  height: 44,
  background: '#0f0f0f',
  border: '1px solid #262626',
  borderRadius: 8,
  color: '#fff',
  padding: '0 12px',
  fontSize: 14,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const textareaStyle: React.CSSProperties = {
  background: '#0f0f0f',
  border: '1px solid #262626',
  borderRadius: 8,
  color: '#fff',
  padding: '10px 12px',
  fontSize: 14,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 90,
  resize: 'vertical',
};

const selectStyle: React.CSSProperties = {
  height: 44,
  background: '#0f0f0f',
  border: '1px solid #262626',
  borderRadius: 8,
  color: '#fff',
  padding: '0 12px',
  fontSize: 14,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  appearance: 'none',
  cursor: 'pointer',
};

function primaryBtn(disabled = false): React.CSSProperties {
  return {
    height: 44,
    background: disabled ? '#7f1d1d' : '#dc2626',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontWeight: 600,
    fontSize: 14,
    cursor: disabled ? 'not-allowed' : 'pointer',
    padding: '0 20px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    opacity: disabled ? 0.6 : 1,
    minHeight: 44,
    whiteSpace: 'nowrap',
  };
}

function secondaryBtn(): React.CSSProperties {
  return {
    height: 44,
    background: 'transparent',
    border: '1px solid #262626',
    borderRadius: 8,
    color: '#a1a1aa',
    fontWeight: 500,
    fontSize: 14,
    cursor: 'pointer',
    padding: '0 16px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    whiteSpace: 'nowrap',
  };
}

function iconBtn(): React.CSSProperties {
  return {
    background: 'transparent',
    border: '1px solid #262626',
    borderRadius: 6,
    color: '#71717a',
    cursor: 'pointer',
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 34,
    minHeight: 34,
  };
}

// ─── Profile Form Fields (reused in create + edit modal) ─────────────────────

interface ProfileFormData {
  name: string;
  title: string;
  role_type: 'sales_rep' | 'manager' | 'admin';
  email: string;
  phone_number: string;
  bio: string;
  start_year: string;
  slug: string;
}

function ProfileFormFields({
  data,
  onChange,
}: {
  data: ProfileFormData;
  onChange: (field: keyof ProfileFormData, value: string) => void;
}) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Name *</label>
          <input
            style={inputStyle}
            value={data.name}
            placeholder="Full name"
            onChange={e => onChange('name', e.target.value)}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Title</label>
          <input
            style={inputStyle}
            value={data.title}
            placeholder="e.g. Senior Sales Rep"
            onChange={e => onChange('title', e.target.value)}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Role Type</label>
          <select
            style={selectStyle}
            value={data.role_type}
            onChange={e => onChange('role_type', e.target.value)}
          >
            <option value="sales_rep">Sales Rep</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Start Year</label>
          <input
            style={inputStyle}
            type="number"
            value={data.start_year}
            placeholder={String(new Date().getFullYear())}
            min={1990}
            max={new Date().getFullYear()}
            onChange={e => onChange('start_year', e.target.value)}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Email</label>
          <input
            style={inputStyle}
            type="email"
            value={data.email}
            placeholder="rep@company.com"
            onChange={e => onChange('email', e.target.value)}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Phone</label>
          <input
            style={inputStyle}
            type="tel"
            value={data.phone_number}
            placeholder="(555) 000-0000"
            onChange={e => onChange('phone_number', e.target.value)}
          />
        </div>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Bio</label>
        <textarea
          style={textareaStyle}
          value={data.bio}
          placeholder="Short bio about this rep..."
          onChange={e => onChange('bio', e.target.value)}
        />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Slug (URL)</label>
        <input
          style={inputStyle}
          value={data.slug}
          placeholder="auto-generated-from-name"
          onChange={e => onChange('slug', e.target.value)}
        />
        <span style={{ fontSize: 11, color: '#71717a' }}>
          Profile URL: /profile/{data.slug || 'your-slug'}
        </span>
      </div>
    </>
  );
}

// ─── Create / Edit Modal ──────────────────────────────────────────────────────

function CreateEditModal({
  profile,
  userEmail,
  onClose,
  onSaved,
  addToast,
}: {
  profile: QRProfile | null;
  userEmail: string;
  onClose: () => void;
  onSaved: () => void;
  addToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const isEdit = profile !== null;

  const [form, setForm] = React.useState<ProfileFormData>({
    name: profile?.name ?? '',
    title: profile?.title ?? '',
    role_type: profile?.role_type ?? 'sales_rep',
    email: profile?.email ?? '',
    phone_number: profile?.phone_number ?? '',
    bio: profile?.bio ?? '',
    start_year: profile?.start_year ? String(profile.start_year) : '',
    slug: profile?.slug ?? '',
  });

  const [saving, setSaving] = React.useState(false);
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [imagePreview, setImagePreview] = React.useState<string | null>(profile?.image_url ?? null);
  const [uploadingImage, setUploadingImage] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  function handleFieldChange(field: keyof ProfileFormData, value: string) {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'name' && !isEdit) {
        next.slug = slugify(value);
      }
      return next;
    });
  }

  function handleImageSelect(file: File) {
    if (!file.type.startsWith('image/')) {
      addToast('Please select an image file', 'error');
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = e => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleImageSelect(file);
  }

  async function uploadImage(profileId: string) {
    if (!imageFile) return;
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append('image', imageFile);
      const res = await fetch(`${API_BASE}/api/profiles/${profileId}/image`, {
        method: 'POST',
        headers: { 'x-user-email': userEmail },
        body: fd,
      });
      if (!res.ok) throw new Error('Image upload failed');
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSave() {
    if (!form.name.trim()) {
      addToast('Name is required', 'error');
      return;
    }
    if (!form.slug.trim()) {
      addToast('Slug is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        title: form.title.trim() || null,
        role_type: form.role_type,
        email: form.email.trim() || null,
        phone_number: form.phone_number.trim() || null,
        bio: form.bio.trim() || null,
        start_year: form.start_year ? parseInt(form.start_year) : null,
        slug: form.slug.trim(),
      };

      const url = isEdit
        ? `${API_BASE}/api/profiles/${profile!.id}`
        : `${API_BASE}/api/profiles`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': userEmail,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || 'Failed to save profile');
      }

      const data = await res.json();
      const savedId = data.profile?.id ?? profile?.id;

      if (imageFile && savedId) {
        await uploadImage(savedId);
      }

      addToast(isEdit ? 'Profile updated' : 'Profile created', 'success');
      onSaved();
      onClose();
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Failed to save profile', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? 'Edit Profile' : 'Add New Rep'} onClose={onClose} maxWidth={640}>
      <ProfileFormFields data={form} onChange={handleFieldChange} />

      {/* Image Upload */}
      <div style={fieldStyle}>
        <label style={labelStyle}>Headshot Photo</label>
        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? '#dc2626' : '#262626'}`,
            borderRadius: 8,
            padding: '1.5rem',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? 'rgba(220,38,38,0.05)' : '#0f0f0f',
            transition: 'border-color 0.2s, background 0.2s',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {imagePreview ? (
            <img
              src={imagePreview}
              alt="Preview"
              style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <Camera size={32} color="#71717a" />
          )}
          <span style={{ fontSize: 13, color: '#71717a' }}>
            {imagePreview ? 'Click or drag to replace photo' : 'Click or drag to upload photo'}
          </span>
          {uploadingImage && <Loader size={16} color="#dc2626" style={{ animation: 'spin 1s linear infinite' }} />}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); }}
        />
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
        <button style={secondaryBtn()} onClick={onClose}>Cancel</button>
        <button style={primaryBtn(saving)} onClick={handleSave} disabled={saving}>
          {saving ? <Loader size={14} /> : <Check size={14} />}
          {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Profile'}
        </button>
      </div>
    </Modal>
  );
}

// ─── Video Management Modal ───────────────────────────────────────────────────

function VideoManagementModal({
  profile,
  userEmail,
  onClose,
  addToast,
}: {
  profile: QRProfile;
  userEmail: string;
  onClose: () => void;
  addToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [videos, setVideos] = React.useState<ProfileVideo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [videoFile, setVideoFile] = React.useState<File | null>(null);
  const [videoUrl, setVideoUrl] = React.useState('');
  const [videoTitle, setVideoTitle] = React.useState('');
  const [videoDesc, setVideoDesc] = React.useState('');
  const [isWelcome, setIsWelcome] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const videoInputRef = React.useRef<HTMLInputElement>(null);

  async function fetchVideos() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/profiles/${profile.id}/videos`, {
        headers: { 'x-user-email': userEmail },
      });
      const data = await res.json();
      setVideos(data.videos ?? []);
    } catch {
      addToast('Failed to load videos', 'error');
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { fetchVideos(); }, [profile.id]);

  async function handleAddVideo() {
    if (!videoTitle.trim()) {
      addToast('Video title is required', 'error');
      return;
    }
    if (!videoFile && !videoUrl.trim()) {
      addToast('Please upload a video file or paste a URL', 'error');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      if (videoFile) {
        // File upload with progress tracking via XMLHttpRequest
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `${API_BASE}/api/profiles/${profile.id}/videos`);
          xhr.setRequestHeader('x-user-email', userEmail);

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setUploadProgress(Math.round((e.loaded / e.total) * 100));
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              try {
                const err = JSON.parse(xhr.responseText);
                reject(new Error(err.error || 'Upload failed'));
              } catch {
                reject(new Error('Upload failed'));
              }
            }
          };

          xhr.onerror = () => reject(new Error('Network error during upload'));

          const fd = new FormData();
          fd.append('title', videoTitle.trim());
          fd.append('description', videoDesc.trim());
          fd.append('is_welcome_video', String(isWelcome));
          fd.append('video', videoFile);
          xhr.send(fd);
        });
      } else {
        // URL-based video
        const res = await fetch(`${API_BASE}/api/profiles/${profile.id}/videos`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-email': userEmail,
          },
          body: JSON.stringify({
            title: videoTitle.trim(),
            description: videoDesc.trim(),
            video_url: videoUrl.trim(),
            is_welcome_video: isWelcome,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Failed to add video' }));
          throw new Error(err.error || 'Failed to add video');
        }
      }

      addToast('Video added', 'success');
      setVideoFile(null);
      setVideoUrl('');
      setVideoTitle('');
      setVideoDesc('');
      setIsWelcome(false);
      setUploadProgress(0);
      fetchVideos();
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteVideo(videoId: string) {
    if (!window.confirm('Delete this video? This cannot be undone.')) return;
    try {
      const res = await fetch(`${API_BASE}/api/profiles/${profile.id}/videos/${videoId}`, {
        method: 'DELETE',
        headers: { 'x-user-email': userEmail },
      });
      if (!res.ok) throw new Error('Delete failed');
      addToast('Video deleted', 'success');
      fetchVideos();
    } catch {
      addToast('Failed to delete video', 'error');
    }
  }

  return (
    <Modal title={`Videos — ${profile.name}`} onClose={onClose} maxWidth={680}>
      {/* Existing videos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: '#a1a1aa', fontWeight: 600 }}>
          Existing Videos ({videos.length})
        </h3>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#71717a', fontSize: 14, padding: '8px 0' }}>
            <Loader size={16} /> Loading...
          </div>
        ) : videos.length === 0 ? (
          <div style={{ color: '#71717a', fontSize: 14, padding: '8px 0' }}>No videos yet.</div>
        ) : (
          videos.map(v => (
            <div
              key={v.id}
              style={{
                background: '#0a0a0a',
                border: '1px solid #1a1a1a',
                borderRadius: 8,
                padding: '12px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <Video size={20} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{v.title}</span>
                  {v.is_welcome_video && (
                    <span style={{
                      background: 'rgba(220,38,38,0.15)', color: '#dc2626',
                      fontSize: 11, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                    }}>
                      WELCOME
                    </span>
                  )}
                </div>
                {v.description && (
                  <div style={{ color: '#71717a', fontSize: 12, marginTop: 2 }}>{v.description}</div>
                )}
                <div style={{ fontSize: 11, color: '#71717a', marginTop: 4 }}>
                  Added {new Date(v.created_at).toLocaleDateString()}
                </div>
              </div>
              <button
                style={{ ...iconBtn(), color: '#dc2626', borderColor: '#7f1d1d' }}
                onClick={() => handleDeleteVideo(v.id)}
                title="Delete video"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid #1a1a1a' }} />

      {/* Add video form */}
      <h3 style={{ margin: 0, fontSize: 14, color: '#a1a1aa', fontWeight: 600 }}>Add Video</h3>

      <div style={fieldStyle}>
        <label style={labelStyle}>Title *</label>
        <input style={inputStyle} value={videoTitle} placeholder="Video title" onChange={e => setVideoTitle(e.target.value)} />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Description</label>
        <textarea style={{ ...textareaStyle, minHeight: 60 }} value={videoDesc} placeholder="Optional description" onChange={e => setVideoDesc(e.target.value)} />
      </div>

      {/* File upload area */}
      <div style={fieldStyle}>
        <label style={labelStyle}>Upload Video File</label>
        <div
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) { setVideoFile(f); setVideoUrl(''); } }}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => videoInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? '#dc2626' : '#262626'}`,
            borderRadius: 8,
            padding: '1.25rem',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? 'rgba(220,38,38,0.05)' : '#0f0f0f',
            transition: 'border-color 0.2s',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Upload size={20} color={videoFile ? '#dc2626' : '#71717a'} />
          <span style={{ fontSize: 13, color: videoFile ? '#fff' : '#71717a' }}>
            {videoFile ? `${videoFile.name} (${(videoFile.size / 1024 / 1024).toFixed(1)}MB)` : 'Click or drag video file (MP4, MOV up to 200MB)'}
          </span>
        </div>
        <input ref={videoInputRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setVideoFile(f); setVideoUrl(''); } }} />
      </div>

      {/* Upload progress bar */}
      {uploading && uploadProgress > 0 && (
        <div style={{ width: '100%', background: '#1a1a1a', borderRadius: 6, overflow: 'hidden', height: 8 }}>
          <div style={{
            width: `${uploadProgress}%`,
            height: '100%',
            background: uploadProgress < 100 ? '#dc2626' : '#22c55e',
            transition: 'width 0.3s ease',
            borderRadius: 6,
          }} />
          <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 4, textAlign: 'center' }}>
            {uploadProgress < 100 ? `Uploading... ${uploadProgress}%` : 'Processing...'}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, borderTop: '1px solid #262626' }} />
        <span style={{ fontSize: 12, color: '#71717a' }}>OR paste a URL</span>
        <div style={{ flex: 1, borderTop: '1px solid #262626' }} />
      </div>

      <div style={fieldStyle}>
        <input
          style={inputStyle}
          value={videoUrl}
          placeholder="https://youtube.com/watch?v=... or direct .mp4 link"
          onChange={e => { setVideoUrl(e.target.value); if (e.target.value) setVideoFile(null); }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="checkbox"
          id="welcome-video-chk"
          checked={isWelcome}
          onChange={e => setIsWelcome(e.target.checked)}
          style={{ width: 18, height: 18, accentColor: '#dc2626', cursor: 'pointer' }}
        />
        <label htmlFor="welcome-video-chk" style={{ ...labelStyle, cursor: 'pointer', userSelect: 'none' }}>
          Set as welcome video
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button style={secondaryBtn()} onClick={onClose}>Close</button>
        <button style={primaryBtn(uploading)} onClick={handleAddVideo} disabled={uploading}>
          {uploading ? <Loader size={14} /> : <Plus size={14} />}
          {uploading ? 'Uploading...' : 'Add Video'}
        </button>
      </div>
    </Modal>
  );
}

// ─── Bulk Import Modal ────────────────────────────────────────────────────────

function BulkImportModal({
  userEmail,
  onClose,
  onImported,
  addToast,
}: {
  userEmail: string;
  onClose: () => void;
  onImported: () => void;
  addToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [raw, setRaw] = React.useState('');
  const [preview, setPreview] = React.useState<Array<Record<string, string>>>([]);
  const [importing, setImporting] = React.useState(false);
  const [parseError, setParseError] = React.useState('');

  function handleParse() {
    setParseError('');
    const trimmed = raw.trim();
    if (!trimmed) { setParseError('Paste some data first'); return; }

    try {
      // Try JSON first
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        const parsed = JSON.parse(trimmed);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        setPreview(arr);
        return;
      }
      // CSV
      const rows = parseCSV(trimmed);
      if (rows.length === 0) { setParseError('No rows found. Check format.'); return; }
      setPreview(rows);
    } catch (e) {
      setParseError('Parse error: ' + (e instanceof Error ? e.message : 'Invalid format'));
    }
  }

  async function handleImport() {
    if (preview.length === 0) { addToast('Nothing to import', 'error'); return; }
    setImporting(true);
    try {
      const res = await fetch(`${API_BASE}/api/profiles/bulk-import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': userEmail,
        },
        body: JSON.stringify({ profiles: preview }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Import failed' }));
        throw new Error(err.error || 'Import failed');
      }
      const data = await res.json();
      addToast(`Imported ${data.imported ?? preview.length} profiles`, 'success');
      onImported();
      onClose();
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Import failed', 'error');
    } finally {
      setImporting(false);
    }
  }

  const CSV_SAMPLE = 'name,title,email,phone,role_type,bio\nJohn Smith,Sales Rep,john@example.com,555-0100,sales_rep,"10 years experience"';

  return (
    <Modal title="Bulk Import Profiles" onClose={onClose} maxWidth={700}>
      <div style={{ fontSize: 13, color: '#71717a', lineHeight: 1.6 }}>
        Paste a JSON array or CSV below. CSV format:
        <code style={{
          display: 'block', background: '#0a0a0a', border: '1px solid #1a1a1a',
          borderRadius: 6, padding: '8px 10px', marginTop: 6, fontSize: 12,
          color: '#a1a1aa', fontFamily: 'monospace', whiteSpace: 'pre-wrap',
        }}>
          {CSV_SAMPLE}
        </code>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Paste Data</label>
        <textarea
          style={{ ...textareaStyle, minHeight: 150, fontFamily: 'monospace', fontSize: 13 }}
          value={raw}
          placeholder="Paste CSV or JSON here..."
          onChange={e => { setRaw(e.target.value); setPreview([]); setParseError(''); }}
        />
        {parseError && <span style={{ fontSize: 12, color: '#dc2626' }}>{parseError}</span>}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button style={secondaryBtn()} onClick={handleParse}>
          <Eye size={14} />
          Preview ({preview.length} rows)
        </button>
      </div>

      {preview.length > 0 && (
        <div style={{
          background: '#0a0a0a',
          border: '1px solid #1a1a1a',
          borderRadius: 8,
          overflowX: 'auto',
          maxHeight: 260,
          overflowY: 'auto',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {Object.keys(preview[0]).map(k => (
                  <th key={k} style={{
                    padding: '8px 12px', textAlign: 'left', color: '#71717a',
                    fontWeight: 600, borderBottom: '1px solid #1a1a1a',
                    whiteSpace: 'nowrap', position: 'sticky', top: 0, background: '#0a0a0a',
                  }}>
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #0f0f0f' }}>
                  {Object.values(row).map((v, j) => (
                    <td key={j} style={{ padding: '7px 12px', color: '#a1a1aa', whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {String(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button style={secondaryBtn()} onClick={onClose}>Cancel</button>
        <button
          style={primaryBtn(importing || preview.length === 0)}
          onClick={handleImport}
          disabled={importing || preview.length === 0}
        >
          {importing ? <Loader size={14} /> : <Download size={14} />}
          {importing ? 'Importing...' : `Import ${preview.length} Profiles`}
        </button>
      </div>
    </Modal>
  );
}

// ─── Profile Row ──────────────────────────────────────────────────────────────

function ProfileRow({
  profile,
  userEmail,
  onEdit,
  onDeleted,
  onManageVideos,
  onUploadPhoto,
  addToast,
  isMobile,
}: {
  profile: QRProfile;
  userEmail: string;
  onEdit: (p: QRProfile) => void;
  onDeleted: () => void;
  onManageVideos: (p: QRProfile) => void;
  onUploadPhoto: (p: QRProfile) => void;
  addToast: (msg: string, type?: 'success' | 'error') => void;
  isMobile: boolean;
}) {
  const [deleting, setDeleting] = React.useState(false);

  async function handleDelete() {
    if (!window.confirm(`Delete profile for ${profile.name}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/api/profiles/${profile.id}`, {
        method: 'DELETE',
        headers: { 'x-user-email': userEmail },
      });
      if (!res.ok) throw new Error('Delete failed');
      addToast('Profile deleted', 'success');
      onDeleted();
    } catch {
      addToast('Failed to delete profile', 'error');
    } finally {
      setDeleting(false);
    }
  }

  const avatarContent = profile.image_url ? (
    <img
      src={profile.image_url}
      alt={profile.name}
      style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid #262626' }}
    />
  ) : (
    <div style={{
      width: 40, height: 40, borderRadius: '50%',
      background: '#dc2626',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0,
      border: '2px solid #7f1d1d',
    }}>
      {getInitials(profile.name)}
    </div>
  );

  if (isMobile) {
    return (
      <div style={{
        background: '#0a0a0a',
        border: '1px solid #1a1a1a',
        borderRadius: 10,
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {avatarContent}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.name}</div>
            {profile.title && <div style={{ color: '#71717a', fontSize: 12 }}>{profile.title}</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={badgeStyle(profile.is_active)}>{profile.is_active ? 'Active' : 'Inactive'}</span>
            <span style={badgeStyle(profile.is_claimed)}>{profile.is_claimed ? 'Claimed' : 'Unclaimed'}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 12, color: '#71717a' }}>
          {profile.email && <span>{profile.email}</span>}
          {profile.phone_number && <span>{profile.phone_number}</span>}
          <a href={`/profile/${profile.slug}`} target="_blank" rel="noopener noreferrer" style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: 3 }}>
            /{profile.slug} <ExternalLink size={10} />
          </a>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <QrCode size={12} /> {profile.qr_scan_count} scans
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={iconBtn()} onClick={() => onEdit(profile)} title="Edit"><Edit2 size={14} /></button>
          <button style={iconBtn()} onClick={() => onUploadPhoto(profile)} title="Upload Photo"><Camera size={14} /></button>
          <button style={iconBtn()} onClick={() => onManageVideos(profile)} title="Manage Videos"><Video size={14} /></button>
          <button
            style={{ ...iconBtn(), color: '#dc2626', borderColor: '#7f1d1d' }}
            onClick={handleDelete}
            disabled={deleting}
            title="Delete"
          >
            {deleting ? <Loader size={14} /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
      <td style={tdStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {avatarContent}
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.name}</div>
            {profile.title && <div style={{ color: '#71717a', fontSize: 12 }}>{profile.title}</div>}
          </div>
        </div>
      </td>
      <td style={tdStyle}>
        <div style={{ fontSize: 13, color: '#a1a1aa' }}>{profile.email || '—'}</div>
        <div style={{ fontSize: 12, color: '#71717a' }}>{profile.phone_number || ''}</div>
      </td>
      <td style={tdStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={badgeStyle(profile.is_active)}>{profile.is_active ? 'Active' : 'Inactive'}</span>
          <span style={badgeStyle(profile.is_claimed)}>{profile.is_claimed ? 'Claimed' : 'Unclaimed'}</span>
        </div>
      </td>
      <td style={tdStyle}>
        <a
          href={`/profile/${profile.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#dc2626', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
        >
          /{profile.slug}
          <ExternalLink size={11} />
        </a>
      </td>
      <td style={{ ...tdStyle, textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', color: '#a1a1aa', fontSize: 14 }}>
          <QrCode size={13} color="#71717a" />
          {profile.qr_scan_count}
        </div>
      </td>
      <td style={tdStyle}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={iconBtn()} onClick={() => onEdit(profile)} title="Edit profile">
            <Edit2 size={14} />
          </button>
          <button style={iconBtn()} onClick={() => onUploadPhoto(profile)} title="Upload photo">
            <Camera size={14} />
          </button>
          <button style={iconBtn()} onClick={() => onManageVideos(profile)} title="Manage videos">
            <Video size={14} />
          </button>
          <button
            style={{ ...iconBtn(), color: '#dc2626', borderColor: '#7f1d1d' }}
            onClick={handleDelete}
            disabled={deleting}
            title="Delete profile"
          >
            {deleting ? <Loader size={14} /> : <Trash2 size={14} />}
          </button>
        </div>
      </td>
    </tr>
  );
}

function badgeStyle(active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 7px',
    borderRadius: 4,
    background: active ? 'rgba(22,163,74,0.15)' : 'rgba(113,113,122,0.15)',
    color: active ? '#16a34a' : '#71717a',
    border: `1px solid ${active ? 'rgba(22,163,74,0.3)' : '#262626'}`,
    whiteSpace: 'nowrap',
  };
}

const tdStyle: React.CSSProperties = {
  padding: '12px 14px',
  verticalAlign: 'middle',
  color: '#a1a1aa',
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  padding: '10px 14px',
  textAlign: 'left',
  color: '#71717a',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid #1a1a1a',
  background: '#0a0a0a',
  whiteSpace: 'nowrap',
};

// ─── Upload Photo Modal (standalone) ─────────────────────────────────────────

function UploadPhotoModal({
  profile,
  userEmail,
  onClose,
  onUploaded,
  addToast,
}: {
  profile: QRProfile;
  userEmail: string;
  onClose: () => void;
  onUploaded: () => void;
  addToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(profile.image_url);
  const [uploading, setUploading] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  function handleSelect(f: File) {
    if (!f.type.startsWith('image/')) { addToast('Please select an image file', 'error'); return; }
    setFile(f);
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  }

  async function handleUpload() {
    if (!file) { addToast('Select a photo first', 'error'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch(`${API_BASE}/api/profiles/${profile.id}/image`, {
        method: 'POST',
        headers: { 'x-user-email': userEmail },
        body: fd,
      });
      if (!res.ok) throw new Error('Upload failed');
      addToast('Photo uploaded', 'success');
      onUploaded();
      onClose();
    } catch {
      addToast('Failed to upload photo', 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal title={`Upload Photo — ${profile.name}`} onClose={onClose} maxWidth={480}>
      <div
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleSelect(f); }}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? '#dc2626' : '#262626'}`,
          borderRadius: 12,
          padding: '2.5rem 1.5rem',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragOver ? 'rgba(220,38,38,0.05)' : '#0f0f0f',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          transition: 'border-color 0.2s',
        }}
      >
        {preview ? (
          <img src={preview} alt="Preview" style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', border: '3px solid #262626' }} />
        ) : (
          <div style={{
            width: 100, height: 100, borderRadius: '50%', background: '#dc2626',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 700, color: '#fff',
          }}>
            {getInitials(profile.name)}
          </div>
        )}
        <div>
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>
            {file ? file.name : 'Click or drag to upload headshot'}
          </div>
          <div style={{ color: '#71717a', fontSize: 12, marginTop: 4 }}>JPG, PNG, WEBP up to 10MB</div>
        </div>
        <Image size={20} color="#71717a" />
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleSelect(f); }} />

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button style={secondaryBtn()} onClick={onClose}>Cancel</button>
        <button style={primaryBtn(uploading || !file)} onClick={handleUpload} disabled={uploading || !file}>
          {uploading ? <Loader size={14} /> : <Upload size={14} />}
          {uploading ? 'Uploading...' : 'Upload Photo'}
        </button>
      </div>
    </Modal>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminQRProfilesPanel({ userEmail }: AdminQRProfilesPanelProps) {
  const [profiles, setProfiles] = React.useState<QRProfile[]>([]);
  const [stats, setStats] = React.useState<FeatureStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [featureEnabled, setFeatureEnabled] = React.useState(false);
  const [togglingFeature, setTogglingFeature] = React.useState(false);

  // Modals
  const [createEditProfile, setCreateEditProfile] = React.useState<QRProfile | null | 'new'>('');
  const [videoProfile, setVideoProfile] = React.useState<QRProfile | null>(null);
  const [uploadPhotoProfile, setUploadPhotoProfile] = React.useState<QRProfile | null>(null);
  const [showBulkImport, setShowBulkImport] = React.useState(false);

  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);

  const { toasts, add: addToast } = useToasts();

  React.useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < 768); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  async function fetchStats() {
    try {
      const res = await fetch(`${API_BASE}/api/profiles/feature-status`, {
        headers: { 'x-user-email': userEmail },
      });
      const data = await res.json();
      setStats(data);
      setFeatureEnabled(data.feature_enabled ?? false);
    } catch {
      // stats are non-critical
    }
  }

  async function fetchProfiles() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/profiles`, {
        headers: { 'x-user-email': userEmail },
      });
      const data = await res.json();
      if (data.success) {
        setProfiles(data.profiles ?? []);
      }
    } catch {
      addToast('Failed to load profiles', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    await Promise.all([fetchProfiles(), fetchStats()]);
  }

  React.useEffect(() => {
    refresh();
  }, []);

  async function handleToggleFeature() {
    setTogglingFeature(true);
    try {
      const res = await fetch(`${API_BASE}/api/profiles/toggle-feature`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': userEmail,
        },
        body: JSON.stringify({ enabled: !featureEnabled }),
      });
      if (!res.ok) throw new Error('Toggle failed');
      setFeatureEnabled(prev => !prev);
      addToast(`QR Profiles feature ${!featureEnabled ? 'enabled' : 'disabled'}`, 'success');
    } catch {
      addToast('Failed to toggle feature', 'error');
    } finally {
      setTogglingFeature(false);
    }
  }

  const filteredProfiles = profiles.filter(p => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q) ||
      p.slug.toLowerCase().includes(q) ||
      p.title?.toLowerCase().includes(q)
    );
  });

  const showCreateEdit = createEditProfile === 'new' || (createEditProfile !== '' && createEditProfile !== null && typeof createEditProfile === 'object');

  return (
    <div style={{
      background: '#0f0f0f',
      minHeight: '100%',
      padding: isMobile ? '1rem' : '1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <ToastContainer toasts={toasts} />

      {/* Header */}
      <div>
        <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 10 }}>
          <QrCode size={22} color="#dc2626" />
          QR Profiles
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: '#71717a' }}>
          Manage sales rep profiles linked to QR codes
        </p>
      </div>

      {/* Stats Bar */}
      <div style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <StatCard
          label="Total Profiles"
          value={stats?.total_profiles ?? profiles.length}
          icon={<Users size={12} />}
        />
        <StatCard
          label="Active"
          value={stats?.active_profiles ?? profiles.filter(p => p.is_active).length}
          icon={<Check size={12} />}
        />
        <StatCard
          label="Claimed"
          value={stats?.claimed_profiles ?? profiles.filter(p => p.is_claimed).length}
          icon={<Eye size={12} />}
        />
        <StatCard
          label="Total Scans"
          value={stats?.total_scans ?? profiles.reduce((sum, p) => sum + p.qr_scan_count, 0)}
          icon={<QrCode size={12} />}
        />
      </div>

      {/* Action Bar */}
      <div style={{
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <button
          style={primaryBtn()}
          onClick={() => setCreateEditProfile('new')}
        >
          <Plus size={16} />
          Add Rep
        </button>

        <button
          style={secondaryBtn()}
          onClick={() => setShowBulkImport(true)}
        >
          <Upload size={16} />
          Bulk Import
        </button>

        {/* Feature Toggle */}
        <button
          onClick={handleToggleFeature}
          disabled={togglingFeature}
          style={{
            ...secondaryBtn(),
            color: featureEnabled ? '#16a34a' : '#71717a',
            borderColor: featureEnabled ? 'rgba(22,163,74,0.4)' : '#262626',
            background: featureEnabled ? 'rgba(22,163,74,0.08)' : 'transparent',
          }}
        >
          {togglingFeature ? (
            <Loader size={16} />
          ) : featureEnabled ? (
            <ToggleRight size={16} />
          ) : (
            <ToggleLeft size={16} />
          )}
          {featureEnabled ? 'Feature On' : 'Feature Off'}
        </button>

        {/* Search */}
        <div style={{
          flex: 1,
          minWidth: 160,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
        }}>
          <Search size={15} color="#71717a" style={{ position: 'absolute', left: 12, pointerEvents: 'none' }} />
          <input
            style={{ ...inputStyle, paddingLeft: 36 }}
            value={search}
            placeholder="Search by name, email, slug..."
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute', right: 10, background: 'none', border: 'none',
                cursor: 'pointer', color: '#71717a', display: 'flex', alignItems: 'center',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Profiles Table / Grid */}
      <div style={{
        background: '#0a0a0a',
        border: '1px solid #262626',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', padding: '3rem', color: '#71717a', fontSize: 14 }}>
            <Loader size={20} color="#dc2626" />
            Loading profiles...
          </div>
        ) : filteredProfiles.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '3rem',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          }}>
            <Users size={40} color="#262626" />
            <div style={{ color: '#71717a', fontSize: 15 }}>
              {search ? 'No profiles match your search.' : 'No profiles yet. Add your first rep.'}
            </div>
            {!search && (
              <button style={primaryBtn()} onClick={() => setCreateEditProfile('new')}>
                <Plus size={14} />
                Add First Rep
              </button>
            )}
          </div>
        ) : isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
            {filteredProfiles.map(p => (
              <ProfileRow
                key={p.id}
                profile={p}
                userEmail={userEmail}
                onEdit={prof => setCreateEditProfile(prof)}
                onDeleted={refresh}
                onManageVideos={prof => setVideoProfile(prof)}
                onUploadPhoto={prof => setUploadPhotoProfile(prof)}
                addToast={addToast}
                isMobile={true}
              />
            ))}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Rep</th>
                  <th style={thStyle}>Contact</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Slug</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Scans</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProfiles.map(p => (
                  <ProfileRow
                    key={p.id}
                    profile={p}
                    userEmail={userEmail}
                    onEdit={prof => setCreateEditProfile(prof)}
                    onDeleted={refresh}
                    onManageVideos={prof => setVideoProfile(prof)}
                    onUploadPhoto={prof => setUploadPhotoProfile(prof)}
                    addToast={addToast}
                    isMobile={false}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer row count */}
        {!loading && filteredProfiles.length > 0 && (
          <div style={{
            padding: '10px 16px',
            borderTop: '1px solid #1a1a1a',
            fontSize: 12,
            color: '#71717a',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <Users size={12} />
            {filteredProfiles.length} {filteredProfiles.length === 1 ? 'profile' : 'profiles'}
            {search && ` matching "${search}"`}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateEdit && (
        <CreateEditModal
          profile={createEditProfile === 'new' ? null : (createEditProfile as QRProfile)}
          userEmail={userEmail}
          onClose={() => setCreateEditProfile('')}
          onSaved={refresh}
          addToast={addToast}
        />
      )}

      {videoProfile && (
        <VideoManagementModal
          profile={videoProfile}
          userEmail={userEmail}
          onClose={() => setVideoProfile(null)}
          addToast={addToast}
        />
      )}

      {uploadPhotoProfile && (
        <UploadPhotoModal
          profile={uploadPhotoProfile}
          userEmail={userEmail}
          onClose={() => setUploadPhotoProfile(null)}
          onUploaded={refresh}
          addToast={addToast}
        />
      )}

      {showBulkImport && (
        <BulkImportModal
          userEmail={userEmail}
          onClose={() => setShowBulkImport(false)}
          onImported={refresh}
          addToast={addToast}
        />
      )}
    </div>
  );
}
