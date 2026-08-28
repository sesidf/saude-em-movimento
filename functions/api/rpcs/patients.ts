export const handlePatientsRpc = async (env: any, functionName: string, params: any) => {
  if (functionName === 'list_patients_catalog') {
    const search = params.p_search || null;
    const limit = params.p_limit || 100;
    
    let query = "SELECT * FROM patients";
    const bindParams: any[] = [];
    
    if (search) {
      query += " WHERE full_name LIKE ? OR cpf LIKE ? OR phone LIKE ?";
      const likeSearch = '%' + search + '%';
      bindParams.push(likeSearch, likeSearch, likeSearch);
    }
    query += " ORDER BY full_name ASC LIMIT ?";
    bindParams.push(limit);
    
    const { results, success, error } = await env.DB.prepare(query).bind(...bindParams).all();
    if (!success) throw new Error(error || 'Failed to list patients');
    return { data: results, error: null };
  }

  if (functionName === 'upsert_patient') {
    const payload = params.p_payload;
    if (!payload || !payload.id) throw new Error('Invalid payload');
    
    // Check if exists
    const existing = await env.DB.prepare("SELECT id FROM patients WHERE id = ?").bind(payload.id).first();
    let query = '';
    let bindParams: any[] = [];
    
    if (existing) {
      // Update
      const keys = Object.keys(payload).filter(k => k !== 'id');
      const setClause = keys.map(k => k + " = ?").join(", ");
      query = "UPDATE patients SET " + setClause + ", updated_at = CURRENT_TIMESTAMP WHERE id = ?";
      bindParams = [...keys.map(k => payload[k]), payload.id];
    } else {
      // Insert
      const keys = Object.keys(payload);
      const placeholders = keys.map(() => "?").join(", ");
      query = "INSERT INTO patients (" + keys.join(", ") + ") VALUES (" + placeholders + ")";
      bindParams = keys.map(k => payload[k]);
    }
    
    const { success, error } = await env.DB.prepare(query).bind(...bindParams).run();
    if (!success) throw new Error(error || 'Failed to upsert patient');
    
    // Log
    await env.DB.prepare("INSERT INTO audit_log (id, table_name, record_id, action, changed_by) VALUES (lower(hex(randomblob(16))), 'patients', ?, ?, ?)")
      .bind(payload.id, existing ? 'UPDATE' : 'INSERT', params.p_user_id || 'system').run();
      
    return { data: { success: true }, error: null };
  }

  return { data: null, error: 'Function not implemented' };
};
