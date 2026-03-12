import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = request.headers.get('authorization');
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { message: 'No file uploaded' },
        { status: 400 }
      );
    }
    const backendFormData = new FormData();
    backendFormData.append('file', file);
    const headers: HeadersInit = {};
    if (auth) headers['Authorization'] = auth;
    const res = await fetch(`${API_BASE}/api/v1/orders/${id}/files`, {
      method: 'POST',
      headers,
      body: backendFormData,
    });
    const text = await res.text();
    if (!res.ok) {
      const err = text ? JSON.parse(text) : {};
      return NextResponse.json(
        { message: (err as { message?: string }).message || `Upload failed: ${res.status}` },
        { status: res.status }
      );
    }
    const data = text ? JSON.parse(text) : undefined;
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Upload failed';
    return NextResponse.json({ message }, { status: 500 });
  }
}
