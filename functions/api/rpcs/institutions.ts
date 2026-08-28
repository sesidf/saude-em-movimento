export const handleInstitutionsRpc = async (env: any, functionName: string, params: any) => {
  if (functionName === 'list_institutions_catalog' || functionName === 'get_all_institutions_catalog') {
    const search = params.p_search || null;
    let query = "SELECT * FROM institutions";
    const bindParams: any[] = [];
    
    if (search) {
      query += " WHERE name LIKE ? OR cnpj LIKE ?";
      const likeSearch = '%' + search + '%';
      bindParams.push(likeSearch, likeSearch);
    }
    query += " ORDER BY name ASC";
    
    const { results, success, error } = await env.DB.prepare(query).bind(...bindParams).all();
    if (!success) throw new Error(error || 'Failed to list institutions');
    return { data: results, error: null };
  }

  if (functionName === 'upsert_institution') {
    const payload = params.p_payload;
    const existing = await env.DB.prepare("SELECT id FROM institutions WHERE id = ?").bind(payload.id).first();
    let query = '';
    let bindParams: any[] = [];
    
    if (existing) {
      query = "UPDATE institutions SET name = ?, cnpj = ?, email = ?, phone = ?, address = ?, city = ?, state = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?";
      bindParams = [payload.name, payload.cnpj, payload.email, payload.phone, payload.address, payload.city, payload.state, payload.is_active ? 1 : 0, payload.id];
    } else {
      query = "INSERT INTO institutions (id, name, cnpj, email, phone, address, city, state, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
      bindParams = [payload.id, payload.name, payload.cnpj, payload.email, payload.phone, payload.address, payload.city, payload.state, payload.is_active ? 1 : 0];
    }
    const { success, error } = await env.DB.prepare(query).bind(...bindParams).run();
    if (!success) throw new Error(error || 'Failed to upsert institution');
    return { data: { success: true }, error: null };
  }
  
  if (functionName === 'set_institution_active') {
    const { p_institution_id, p_is_active } = params;
    const { success, error } = await env.DB.prepare("UPDATE institutions SET is_active = ? WHERE id = ?").bind(p_is_active ? 1 : 0, p_institution_id).run();
    if (!success) throw new Error(error || 'Failed to update institution');
    return { data: { success: true }, error: null };
  }

  if (functionName === 'api_excluir_instituicao') {
    const { p_institution_id } = params;
    // In soft delete mode
    const { success, error } = await env.DB.prepare("UPDATE institutions SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").bind(p_institution_id).run();
    if (!success) throw new Error(error || 'Failed to delete institution');
    return { data: { success: true }, error: null };
  }

  return { data: null, error: 'Function not implemented' };
};
