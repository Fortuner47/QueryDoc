const API_BASE = '/api';

export async function sendChatMessage(query, options = {}) {
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, ...options }),
  });
  
  if (!response.ok) {
    throw new Error(`Chat API error: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchSystemStatus() {
  const response = await fetch(`${API_BASE}/status`);
  if (!response.ok) {
    throw new Error(`Status API error: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchDocuments() {
  const response = await fetch(`${API_BASE}/documents`);
  if (!response.ok) {
    throw new Error(`Documents API error: ${response.statusText}`);
  }
  return response.json();
}

export async function deleteDocument(docId) {
  const response = await fetch(`${API_BASE}/documents/${docId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`Delete API error: ${response.statusText}`);
  }
  return response.json();
}

export async function uploadDocuments(files) {
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }
  
  const response = await fetch(`${API_BASE}/documents`, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    throw new Error(`Upload API error: ${response.statusText}`);
  }
  return response.json();
}
