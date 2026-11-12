import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: 180, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#51466f', borderRadius: 42 }}>
      <div style={{ height: 82, display: 'flex', alignItems: 'flex-end', gap: 10 }}>
        <div style={{ width: 18, height: 44, borderRadius: 9, background: 'rgba(255,255,255,.72)' }} />
        <div style={{ width: 18, height: 82, borderRadius: 9, background: '#fff' }} />
        <div style={{ width: 18, height: 62, borderRadius: 9, background: 'rgba(255,255,255,.86)' }} />
      </div>
    </div>,
    size,
  )
}
