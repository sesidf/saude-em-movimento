import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import xlsx from 'xlsx';

// Carregar variáveis de ambiente dos arquivos .env locales
const envFiles = ['.env', '.env.local', '.env.production', '.env.development'];
const cwd = process.cwd();

const parseEnvFile = (conteudo) => {
  const envs = {};
  for (const linhaBruta of conteudo.split(/\r?\n/)) {
    const linha = linhaBruta.trim();
    if (!linha || linha.startsWith('#')) continue;
    const divisor = linha.indexOf('=');
    if (divisor <= 0) continue;
    const chave = linha.slice(0, divisor).trim();
    let valor = linha.slice(divisor + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    if (chave) envs[chave] = valor;
  }
  return envs;
};

const carregarVariaveisAmbiente = () => {
  const carregadas = {};
  for (const arquivo of envFiles) {
    const caminhoCompleto = path.resolve(cwd, arquivo);
    if (!fs.existsSync(caminhoCompleto)) continue;
    const parsed = parseEnvFile(fs.readFileSync(caminhoCompleto, 'utf8'));
    for (const [chave, valor] of Object.entries(parsed)) {
      if (!(chave in carregadas)) {
        carregadas[chave] = valor;
      }
    }
  }
  return carregadas;
};

const envEfetivo = {
  ...carregarVariaveisAmbiente(),
  ...process.env,
};

const databaseUrl = envEfetivo.DATABASE_URL || '';

if (!databaseUrl) {
  console.error('[importar] ERRO: DATABASE_URL não configurada no ambiente nem nos arquivos .env.');
  console.error('Defina-a antes de rodar o script.');
  console.error('Exemplo no PowerShell:');
  console.error('  $env:DATABASE_URL="postgresql://postgres:senha@host:porta/postgres"');
  process.exit(1);
}

// Resolução de SSL para o PostgreSQL
const resolverPgSsl = (urlConexao) => {
  try {
    const urlObj = new URL(urlConexao);
    const host = urlObj.hostname.toLowerCase();
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (isLocal) return undefined;
    const sslMode = (urlObj.searchParams.get('sslmode') ?? '').toLowerCase();
    if (sslMode === 'disable') return false;
    return { rejectUnauthorized: false };
  } catch {
    return undefined;
  }
};

// Gerador determinístico de UUIDs para evitar duplicações se o script rodar mais de uma vez
const gerarUuidDeterministico = (semente) => {
  const hash = crypto.createHash('sha256').update(semente).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
};

const sanitizarEmail = (email) => {
  if (!email) return null;
  const limpo = email.trim().toLowerCase();
  return limpo.includes('@') ? limpo : null;
};

const limparDígitos = (valor) => {
  if (!valor) return '';
  return String(valor).replace(/\D/g, '');
};

const normalizarNome = (nome) => {
  if (!nome) return '';
  return nome.trim().replace(/\s+/g, ' ');
};

const mapearStatusConsulta = (situacao) => {
  if (!situacao) return 'agendado';
  const s = String(situacao).trim().toLowerCase();
  if (s.includes('agend')) return 'agendado';
  if (s.includes('confirm')) return 'confirmado';
  if (s.includes('atend') || s.includes('andamento')) return 'em_atendimento';
  if (s.includes('concl') || s.includes('finaliz')) return 'concluido';
  if (s.includes('cancel')) return 'cancelado';
  if (s.includes('compareceu') || s.includes('falta') || s.includes('faltou')) return 'nao_compareceu';
  if (s.includes('reagend')) return 'reagendado';
  return 'agendado';
};

const extrairIniciais = (nome) => {
  return nome
    .split(' ')
    .map(p => p[0])
    .filter(c => c && c === c.toUpperCase() && /[a-zA-Z]/.test(c))
    .join('')
    .slice(0, 3)
    .toUpperCase();
};

const formatarDataIso = (valor) => {
  if (!valor) return null;
  
  // Se já for uma data do JS (gerada pelo leitor do xlsx)
  if (valor instanceof Date) {
    return valor.toISOString();
  }
  
  // Tentar conversão string
  try {
    const d = new Date(valor);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  } catch {}
  
  return null;
};

async function iniciarImportacao() {
  const args = process.argv.slice(2);
  const caminhoPlanilha = args[0] || 'dados_corrigidos.xlsx';

  if (!fs.existsSync(caminhoPlanilha)) {
    console.error(`[importar] ERRO: Arquivo de planilha não encontrado em: ${caminhoPlanilha}`);
    console.error('Por favor, coloque a planilha na pasta raiz com o nome "dados_corrigidos.xlsx"');
    console.error('ou passe o caminho do arquivo como argumento. Ex: npm run db:importar:planilha -- "Caminho/Para/Planilha.csv"');
    process.exit(1);
  }

  console.log(`[importar] Lendo arquivo: ${caminhoPlanilha}...`);
  const workbook = xlsx.readFile(caminhoPlanilha, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const linhas = xlsx.utils.sheet_to_json(worksheet);

  if (linhas.length === 0) {
    console.error('[importar] ERRO: A planilha está vazia.');
    process.exit(1);
  }

  console.log(`[importar] Encontradas ${linhas.length} linhas para processar.`);

  // Importar o driver pg
  const { Client } = await import('pg');
  const cliente = new Client({
    connectionString: databaseUrl,
    ssl: resolverPgSsl(databaseUrl),
  });

  try {
    await cliente.connect();
    console.log('[importar] Conectado ao banco de dados PostgreSQL.');

    // ID do superadmin fixo do sistema
    const superadminId = 'e1610477-7e32-4dc7-88dc-39c84db49ede';
    
    // Verificar se o superadmin existe no banco novo
    const resSa = await cliente.query('SELECT id FROM public.users WHERE id = $1', [superadminId]);
    if (resSa.rows.length === 0) {
      console.warn('[importar] AVISO: O usuário superadmin padrão não foi encontrado na tabela public.users.');
      console.warn('Certifique-se de que rodou "npm run db:apply:baseline" e promoveu o superadmin antes.');
    }

    // Tabelas que vamos desativar triggers temporariamente
    const tabelasComTriggers = [
      'public.medical_record_entries',
      'public.encounters',
      'public.appointments',
      'public.doctors',
      'public.patients',
      'public.specialties',
      'public.user_roles',
      'public.profiles',
      'public.users',
      'public.institutions'
    ];

    console.log('[importar] Desativando triggers de usuário para carga operacional rápida...');
    for (const tabela of tabelasComTriggers) {
      await cliente.query(`ALTER TABLE ${tabela} DISABLE TRIGGER USER`);
    }

    // Iniciar transação
    await cliente.query('BEGIN');
    
    // Setar variáveis de configuração da sessão para contornar guardrails, se existirem
    await cliente.query("SET LOCAL app.seed_operation = 'true'");
    await cliente.query("SET LOCAL app.clinical_operation = 'true'");
    await cliente.query("SET LOCAL app.access_operation = 'true'");

    // Caches locais para evitar buscas redundantes e otimizar velocidade
    const cacheInstituicoes = new Map(); // nome -> id
    const cacheEspecialidades = new Map(); // nome -> id
    const cacheMedicos = new Map(); // nome -> { id, userId }
    const cachePacientes = new Map(); // cpf -> id

    // Contadores
    let criadasInst = 0;
    let criadasEsp = 0;
    let criadosMed = 0;
    let criadosPac = 0;
    let criadosAgend = 0;
    let criadosEncount = 0;
    let criadosRecord = 0;

    console.log('[importar] Iniciando processamento linha por linha...');

    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      const numeroLinha = i + 2; // Cabeçalho é linha 1

      // Mapeamento dos campos da planilha com base nos nomes enviados
      const nomeInst = normalizarNome(linha['Instituição']);
      const nomeEsp = normalizarNome(linha['Especialidade']);
      const nomeMed = normalizarNome(linha['Profissional']);
      const nomePac = normalizarNome(linha['Paciente']);
      const cpfPacRaw = linha['Patient Cpf'];
      const dataNascRaw = linha['Data de nascimento'];
      const emailPac = sanitizarEmail(linha['Patient Email']);
      const fonePac = limparDígitos(linha['Patient Phone']);
      const dataConsultaRaw = linha['Data da consulta'];
      const situacao = linha['Situação'];
      const motivo = linha['Motivo'] ? String(linha['Motivo']).trim() : null;

      // Pular registros sem dados cruciais de agendamento ou paciente
      if (!nomePac || !cpfPacRaw || !dataConsultaRaw) {
        console.warn(`[importar] Linha ${numeroLinha} ignorada por ausência de dados cruciais (Paciente, CPF ou Data da Consulta).`);
        continue;
      }

      const cpfPac = limparDígitos(cpfPacRaw);
      if (cpfPac.length !== 11) {
        console.warn(`[importar] Linha ${numeroLinha}: CPF inválido (${cpfPacRaw}). Prosseguindo com o dado limpo de tamanho ${cpfPac.length}.`);
      }

      // 1. Resolver Instituição
      let instituicaoId = null;
      if (nomeInst) {
        const chaveInst = nomeInst.toLowerCase();
        if (cacheInstituicoes.has(chaveInst)) {
          instituicaoId = cacheInstituicoes.get(chaveInst);
        } else {
          // Buscar no banco
          const res = await cliente.query('SELECT id FROM public.institutions WHERE lower(name) = $1', [chaveInst]);
          if (res.rows.length > 0) {
            instituicaoId = res.rows[0].id;
          } else {
            // Cadastrar nova instituição
            const novoId = gerarUuidDeterministico(`inst:${chaveInst}`);
            await cliente.query(
              `INSERT INTO public.institutions (id, name, is_active) VALUES ($1, $2, true) ON CONFLICT (id) DO NOTHING`,
              [novoId, nomeInst]
            );
            instituicaoId = novoId;
            criadasInst++;
          }
          cacheInstituicoes.set(chaveInst, instituicaoId);
        }
      }

      // 2. Resolver Especialidade
      let especialidadeId = null;
      if (nomeEsp) {
        const chaveEsp = nomeEsp.toLowerCase();
        if (cacheEspecialidades.has(chaveEsp)) {
          especialidadeId = cacheEspecialidades.get(chaveEsp);
        } else {
          const res = await cliente.query('SELECT id FROM public.specialties WHERE lower(name) = $1', [chaveEsp]);
          if (res.rows.length > 0) {
            especialidadeId = res.rows[0].id;
          } else {
            const novoId = gerarUuidDeterministico(`esp:${chaveEsp}`);
            await cliente.query(
              `INSERT INTO public.specialties (id, name, description, is_active) VALUES ($1, $2, $3, true) ON CONFLICT (id) DO NOTHING`,
              [novoId, nomeEsp, 'Especialidade importada da planilha corrigida']
            );
            especialidadeId = novoId;
            criadasEsp++;
          }
          cacheEspecialidades.set(chaveEsp, especialidadeId);
        }
      }

      // 3. Resolver Médico / Profissional
      let medicoId = null;
      let medicoUserId = null;
      if (nomeMed) {
        const chaveMed = nomeMed.toLowerCase();
        if (cacheMedicos.has(chaveMed)) {
          const med = cacheMedicos.get(chaveMed);
          medicoId = med.id;
          medicoUserId = med.userId;
        } else {
          const res = await cliente.query(
            `SELECT d.id, d.user_id FROM public.doctors d 
             JOIN public.profiles p ON d.user_id = p.id 
             WHERE lower(p.full_name) = $1 AND d.deleted_at IS NULL`,
            [chaveMed]
          );
          if (res.rows.length > 0) {
            medicoId = res.rows[0].id;
            medicoUserId = res.rows[0].user_id;
          } else {
            // Criar profissional dinamicamente
            medicoUserId = gerarUuidDeterministico(`user:medico:${chaveMed}`);
            medicoId = gerarUuidDeterministico(`doc:medico:${chaveMed}`);
            const emailMed = `medico.${chaveMed.replace(/[^a-z0-9]/g, '')}@sistema.local`;
            const crmGerado = `REG-${extrairIniciais(nomeMed)}-${gerarUuidDeterministico(nomeMed).slice(0, 4).toUpperCase()}`;

            // Inserir no auth.users
            await cliente.query(
              `INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
               VALUES ($1, 'authenticated', 'authenticated', $2, '', now(), '{"provider":"email","providers":["email"]}'::jsonb, $3)
               ON CONFLICT (id) DO NOTHING`,
              [medicoUserId, emailMed, JSON.stringify({ full_name: nomeMed, source: 'importacao_planilha' })]
            );

            // Inserir no public.users
            await cliente.query(
              `INSERT INTO public.users (id, auth_user_id, email, full_name, primary_institution_id, is_active, auth_status)
               VALUES ($1, $2, $3, $4, $5, true, 'active')
               ON CONFLICT (id) DO NOTHING`,
              [medicoUserId, medicoUserId, emailMed, nomeMed, instituicaoId]
            );

            // Inserir no public.profiles
            const partesNome = nomeMed.split(' ');
            const primNome = partesNome[0];
            const ultNome = partesNome.slice(1).join(' ') || '';
            await cliente.query(
              `INSERT INTO public.profiles (id, email, first_name, last_name, role, institution_id, is_active)
               VALUES ($1, $2, $3, $4, 'medico', $5, true)
               ON CONFLICT (id) DO NOTHING`,
              [medicoUserId, emailMed, primNome, ultNome, instituicaoId]
            );

            // Vincular na tabela user_roles
            const resRole = await cliente.query(`SELECT id FROM public.roles WHERE key = 'medico' AND institution_id IS NULL LIMIT 1`);
            const roleId = resRole.rows.length > 0 ? resRole.rows[0].id : null;
            if (roleId) {
              await cliente.query(
                `INSERT INTO public.user_roles (user_id, role_id, role, institution_id, granted_by)
                 VALUES ($1, $2, 'medico', $3, $4)
                 ON CONFLICT DO NOTHING`,
                [medicoUserId, roleId, instituicaoId, superadminId]
              );
            }

            // Inserir na tabela public.doctors
            await cliente.query(
              `INSERT INTO public.doctors (id, user_id, professional_council, crm, specialty_id, is_active)
               VALUES ($1, $2, 'CRM', $3, $4, true)
               ON CONFLICT (id) DO NOTHING`,
              [medicoId, medicoUserId, crmGerado, especialidadeId]
            );

            criadosMed++;
          }
          cacheMedicos.set(chaveMed, { id: medicoId, userId: medicoUserId });
        }
      }

      // 4. Resolver Paciente
      let pacienteId = null;
      if (cpfPac) {
        if (cachePacientes.has(cpfPac)) {
          pacienteId = cachePacientes.get(cpfPac);
        } else {
          const res = await cliente.query('SELECT id FROM public.patients WHERE cpf = $1 AND deleted_at IS NULL', [cpfPac]);
          if (res.rows.length > 0) {
            pacienteId = res.rows[0].id;
          } else {
            pacienteId = gerarUuidDeterministico(`pac:${cpfPac}`);
            const codigoPaciente = `PAC-${cpfPac.slice(0, 3)}-${gerarUuidDeterministico(cpfPac).slice(0, 4).toUpperCase()}`;
            const dataNasc = formatarDataIso(dataNascRaw);

            if (!dataNasc) {
              console.warn(`[importar] Linha ${numeroLinha}: Data de nascimento inválida ou ausente para o paciente ${nomePac}.`);
            }

            await cliente.query(
              `INSERT INTO public.patients (id, patient_code, institution_id, full_name, email, phone, cpf, birth_date, is_active, created_by)
               VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, '1980-01-01'::date), true, $9)
               ON CONFLICT (id) DO NOTHING`,
              [pacienteId, codigoPaciente, instituicaoId, nomePac, emailPac, fonePac, cpfPac, dataNasc, superadminId]
            );
            criadosPac++;
          }
          cachePacientes.set(cpfPac, pacienteId);
        }
      }

      // 5. Cadastrar Agendamento (public.appointments)
      const dataConsulta = formatarDataIso(dataConsultaRaw);
      if (!dataConsulta) {
        console.warn(`[importar] Linha ${numeroLinha}: Data da consulta não pôde ser parseada (${dataConsultaRaw}). Pulando agendamento.`);
        continue;
      }

      const dataConsultaObj = new Date(dataConsulta);
      const dataFimObj = new Date(dataConsultaObj.getTime() + 30 * 60 * 1000); // duração padrão 30 min
      const dataFim = dataFimObj.toISOString();

      const statusMapeado = mapearStatusConsulta(situacao);
      const chaveAgend = `${cpfPac}_${dataConsulta}`;
      const agendamentoId = gerarUuidDeterministico(`apt:${chaveAgend}`);
      const codigoAgend = `APT-${gerarUuidDeterministico(chaveAgend).slice(0, 6).toUpperCase()}`;
      const numeroTicket = `TKT-${gerarUuidDeterministico(chaveAgend).slice(6, 12).toUpperCase()}`;

      const resApt = await cliente.query(
        `INSERT INTO public.appointments (
          id, appointment_code, institution_id, patient_id, doctor_id, specialty_id,
          appointment_date, end_date, type, status, reason, ticket_number, created_by, updated_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'consulta', $9, $10, $11, $12, $12)
        ON CONFLICT (id) DO NOTHING
        RETURNING id`,
        [
          agendamentoId, codigoAgend, instituicaoId, pacienteId, medicoId, especialidadeId,
          dataConsulta, dataFim, statusMapeado, motivo, numeroTicket, superadminId
        ]
      );

      if (resApt.rows.length > 0) {
        criadosAgend++;

        // 6. Cadastrar Evolução Clínica / Prontuário para Consultas Concluídas
        if (statusMapeado === 'concluido') {
          const encounterId = gerarUuidDeterministico(`enc:${chaveAgend}`);
          
          // Inserir Atendimento (public.encounters)
          await cliente.query(
            `INSERT INTO public.encounters (id, institution_id, appointment_id, patient_id, doctor_id, status, started_at, finalized_at, started_by, finalized_by)
             VALUES ($1, $2, $3, $4, $5, 'finalizado', $6, $7, $8, $8)
             ON CONFLICT (id) DO NOTHING`,
            [encounterId, instituicaoId, agendamentoId, pacienteId, medicoId, dataConsulta, dataFim, medicoUserId]
          );
          criadosEncount++;

          // Inserir Evolução Anamnese (public.medical_record_entries)
          const recordAnamneseId = gerarUuidDeterministico(`rec:anamnese:${chaveAgend}`);
          const dadosClinicosAnamnese = {
            queixa: motivo || 'Importação de histórico corrigido.',
            origem: 'importacao_planilha_corrigida'
          };
          const hashAnamnese = crypto.createHash('sha256').update(JSON.stringify(dadosClinicosAnamnese)).digest('hex');

          await cliente.query(
            `INSERT INTO public.medical_record_entries (id, institution_id, encounter_id, version, entry_type, clinical_data, content_hash, created_by, created_at)
             VALUES ($1, $2, $3, 1, 'anamnese', $4, $5, $6, $7)
             ON CONFLICT (encounter_id, version) DO NOTHING`,
            [recordAnamneseId, instituicaoId, encounterId, JSON.stringify(dadosClinicosAnamnese), hashAnamnese, medicoUserId, dataConsulta]
          );

          // Inserir Evolução Finalização
          const recordFinalizacaoId = gerarUuidDeterministico(`rec:finalizacao:${chaveAgend}`);
          const dadosClinicosFinalizacao = {
            conduta: 'Consulta de histórico finalizada com sucesso.',
            origem: 'importacao_planilha_corrigida'
          };
          const hashFinalizacao = crypto.createHash('sha256').update(JSON.stringify(dadosClinicosFinalizacao)).digest('hex');

          await cliente.query(
            `INSERT INTO public.medical_record_entries (id, institution_id, encounter_id, version, entry_type, clinical_data, content_hash, created_by, created_at)
             VALUES ($1, $2, $3, 2, 'finalizacao', $4, $5, $6, $7)
             ON CONFLICT (encounter_id, version) DO NOTHING`,
            [recordFinalizacaoId, instituicaoId, encounterId, JSON.stringify(dadosClinicosFinalizacao), hashFinalizacao, medicoUserId, dataFim]
          );

          criadosRecord += 2;

          // Atualizar horários de início e fim reais na consulta
          await cliente.query(
            `UPDATE public.appointments SET actual_start_at = $1, actual_end_at = $2 WHERE id = $3`,
            [dataConsulta, dataFim, agendamentoId]
          );
        } else if (statusMapeado === 'em_atendimento') {
          const encounterId = gerarUuidDeterministico(`enc:${chaveAgend}`);
          
          await cliente.query(
            `INSERT INTO public.encounters (id, institution_id, appointment_id, patient_id, doctor_id, status, started_at, started_by)
             VALUES ($1, $2, $3, $4, $5, 'em_atendimento', $6, $7)
             ON CONFLICT (id) DO NOTHING`,
            [encounterId, instituicaoId, agendamentoId, pacienteId, medicoId, dataConsulta, medicoUserId]
          );
          criadosEncount++;

          await cliente.query(
            `UPDATE public.appointments SET actual_start_at = $1 WHERE id = $2`,
            [dataConsulta, agendamentoId]
          );
        }
      }
    }

    // Confirmar a transação
    await cliente.query('COMMIT');
    console.log('[importar] Transação do banco confirmada com sucesso.');

    console.log('\n--- 📊 RESUMO DA IMPORTAÇÃO ---');
    console.log(`🏢 Instituições cadastradas: ${criadasInst}`);
    console.log(`🩺 Especialidades cadastradas: ${criadasEsp}`);
    console.log(`👨‍⚕️ Médicos cadastrados: ${criadosMed}`);
    console.log(`👤 Pacientes cadastrados: ${criadosPac}`);
    console.log(`📅 Consultas agendadas: ${criadosAgend}`);
    console.log(`🩺 Atendimentos vinculados: ${criadosEncount}`);
    console.log(`🧾 Evoluções no prontuário: ${criadosRecord}`);
    console.log('--------------------------------\n');

  } catch (erro) {
    console.error('[importar] ERRO crítico durante a importação. Fazendo rollback...', erro);
    try {
      await cliente.query('ROLLBACK');
    } catch (eRoll) {
      console.error('[importar] Falha ao tentar rollback da transação.', eRoll);
    }
    process.exit(1);
  } finally {
    console.log('[importar] Reativando triggers das tabelas...');
    for (const tabela of tabelasComTriggers) {
      try {
        await cliente.query(`ALTER TABLE ${tabela} ENABLE TRIGGER USER`);
      } catch (errTrig) {
        console.error(`[importar] Erro ao reativar triggers na tabela ${tabela}:`, errTrig);
      }
    }

    await cliente.end().catch(() => undefined);
    console.log('[importar] Conexão encerrada com o banco de dados.');
  }
}

iniciarImportacao();
