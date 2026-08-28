export const handleDoctorsRpc = async (env: any, functionName: string, params: any) => {
  if (functionName === 'list_doctors_catalog') {
    const search = params.p_search || null;
    let query = `
      SELECT d.*, u.full_name as user_full_name, u.email 
      FROM doctors d 
      LEFT JOIN users u ON d.user_id = u.id
    `;
    const bindParams: any[] = [];
    
    if (search) {
      query += " WHERE u.full_name LIKE ? OR d.crm LIKE ?";
      const likeSearch = '%' + search + '%';
      bindParams.push(likeSearch, likeSearch);
    }
    query += " ORDER BY u.full_name ASC";
    
    const { results, success, error } = await env.DB.prepare(query).bind(...bindParams).all();
    if (!success) throw new Error(error || 'Failed to list doctors');
    return { data: results, error: null };
  }

  if (functionName === 'set_doctor_active') {
    const { p_doctor_id, p_is_active } = params;
    const { success, error } = await env.DB.prepare("UPDATE doctors SET is_active = ? WHERE id = ?").bind(p_is_active ? 1 : 0, p_doctor_id).run();
    if (!success) throw new Error(error || 'Failed to update doctor');
    return { data: { success: true }, error: null };
  }

  if (functionName === 'list_specialties_catalog') {
    const search = params.p_search || null;
    let query = "SELECT * FROM specialties";
    const bindParams: any[] = [];
    
    if (search) {
      query += " WHERE name LIKE ?";
      bindParams.push('%' + search + '%');
    }
    query += " ORDER BY name ASC";
    
    const { results, success, error } = await env.DB.prepare(query).bind(...bindParams).all();
    if (!success) throw new Error(error || 'Failed to list specialties');
    return { data: results, error: null };
  }

  if (functionName === 'upsert_specialty') {
    const payload = params.p_payload;
    const existing = await env.DB.prepare("SELECT id FROM specialties WHERE id = ?").bind(payload.id).first();
    let query = '';
    let bindParams: any[] = [];
    if (existing) {
      query = "UPDATE specialties SET name = ?, description = ?, is_active = ? WHERE id = ?";
      bindParams = [payload.name, payload.description, payload.is_active ? 1 : 0, payload.id];
    } else {
      query = "INSERT INTO specialties (id, name, description, is_active) VALUES (?, ?, ?, ?)";
      bindParams = [payload.id, payload.name, payload.description, payload.is_active ? 1 : 0];
    }
    const { success, error } = await env.DB.prepare(query).bind(...bindParams).run();
    if (!success) throw new Error(error || 'Failed to upsert specialty');
    return { data: { success: true }, error: null };
  }
  
  if (functionName === 'set_specialty_active') {
    const { p_specialty_id, p_is_active } = params;
    const { success, error } = await env.DB.prepare("UPDATE specialties SET is_active = ? WHERE id = ?").bind(p_is_active ? 1 : 0, p_specialty_id).run();
    if (!success) throw new Error(error || 'Failed to update specialty');
    return { data: { success: true }, error: null };
  }

  return { data: null, error: 'Function not implemented' };
};
