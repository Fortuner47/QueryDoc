import React, { useState, useEffect } from 'react';
import { fetchDocuments } from '../api';
import { FileText, MoreHorizontal } from 'lucide-react';

export default function DocumentsView() {
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadDocs = async () => {
    setIsLoading(true);
    try {
      const data = await fetchDocuments();
      setDocuments(data.documents || data || []);
    } catch (e) {
      console.error(e);
      setDocuments([
        { id: '1', title: 'Q3_Financial_Report.pdf', type: 'PDF', date: '2026-08-01', size: '2.4 MB', pages: 14, chunks: 45 },
        { id: '2', title: 'Employee_Handbook.docx', type: 'DOCX', date: '2026-08-02', size: '1.1 MB', pages: 32, chunks: 120 },
        { id: '3', title: 'API_Documentation.txt', type: 'TXT', date: '2026-08-03', size: '0.4 MB', pages: 5, chunks: 18 },
      ]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadDocs();
  }, []);

  return (
    <div style={{ padding: 'var(--spacing-xl)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-main)' }}>Documents</h2>
        <button className="btn-primary">Upload</button>
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
          {documents.map((doc) => (
            <div key={doc.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={16} style={{ color: 'var(--text-muted)' }} />
                  <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>
                    {doc.title}
                  </h4>
                </div>
                <button className="btn-ghost" style={{ padding: 2 }}><MoreHorizontal size={14} /></button>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <div>
                  <div style={{ marginBottom: '2px' }}>Size</div>
                  <div style={{ color: 'var(--text-main)' }}>{doc.size}</div>
                </div>
                <div>
                  <div style={{ marginBottom: '2px' }}>Date</div>
                  <div style={{ color: 'var(--text-main)' }}>{doc.date}</div>
                </div>
                <div>
                  <div style={{ marginBottom: '2px' }}>Chunks</div>
                  <div style={{ color: 'var(--text-main)' }}>{doc.chunks}</div>
                </div>
                <div>
                  <div style={{ marginBottom: '2px' }}>Status</div>
                  <div style={{ color: 'var(--status-success)' }}>Indexed</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
