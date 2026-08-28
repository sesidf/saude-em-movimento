// --- DICIONÁRIO DE NOMES EXPANDIDO PARA SISTEMA MÉDICO ---
const DICIONARIO_NOMES: Record<string, string> = {
  // --- Masculinos ---
  joao: 'João',
  jose: 'José',
  antonio: 'Antônio',
  andre: 'André',
  mario: 'Mário',
  flavio: 'Flávio',
  claudio: 'Cláudio',
  fabio: 'Fábio',
  luis: 'Luís',
  luiz: 'Luiz',
  julio: 'Júlio',
  cesar: 'César',
  valter: 'Válter',
  rogerio: 'Rogério',
  otavio: 'Otávio',
  alvaro: 'Álvaro',
  cicero: 'Cícero',
  angelo: 'Ângelo',
  marcio: 'Márcio',
  vitor: 'Vítor',
  renato: 'Renato',
  romulo: 'Rômulo',
  valdir: 'Valdir',
  valdemir: 'Valdemir',
  ademir: 'Ademir',
  adilson: 'Adilson',
  sebastiao: 'Sebastião',
  damiao: 'Damião',
  estevao: 'Estêvão',
  edson: 'Édson',
  elias: 'Elias',
  isaias: 'Isaías',
  moises: 'Moisés',
  tome: 'Tomé',
  hermes: 'Hermes',
  heitor: 'Heitor',
  marcos: 'Marcos',
  lucas: 'Lucas',
  mateus: 'Mateus',
  matheus: 'Matheus',
  felipe: 'Felipe',
  thiago: 'Thiago',
  tiago: 'Tiago',
  diogo: 'Diogo',
  diego: 'Diego',
  gabriel: 'Gabriel',
  guilherme: 'Guilherme',
  gustavo: 'Gustavo',
  rafael: 'Rafael',
  bruno: 'Bruno',
  rodrigo: 'Rodrigo',
  ricardo: 'Ricardo',
  fernando: 'Fernando',
  eduardo: 'Eduardo',
  carlos: 'Carlos',
  francisco: 'Francisco',
  pedro: 'Pedro',
  paulo: 'Paulo',
  marcelo: 'Marcelo',
  daniel: 'Daniel',
  alexandre: 'Alexandre',
  leandro: 'Leandro',
  victor: 'Victor',
  hugo: 'Hugo',
  igor: 'Igor',
  caio: 'Caio',
  arthur: 'Arthur',
  artur: 'Artur',
  davi: 'Davi',
  samuel: 'Samuel',
  enrique: 'Enrique',
  henrique: 'Henrique',
  murilo: 'Murilo',
  enzo: 'Enzo',
  noah: 'Noah',
  gael: 'Gael',
  ravi: 'Ravi',
  theo: 'Théo',
  teo: 'Téo',

  // --- Femininos ---
  julia: 'Júlia',
  vitoria: 'Vitória',
  conceicao: 'Conceição',
  fatima: 'Fátima',
  marcia: 'Márcia',
  barbara: 'Bárbara',
  lucia: 'Lúcia',
  sonia: 'Sônia',
  maria: 'Maria',
  ana: 'Ana',
  adriana: 'Adriana',
  juliana: 'Juliana',
  patricia: 'Patrícia',
  camila: 'Camila',
  aline: 'Aline',
  sandra: 'Sandra',
  luciana: 'Luciana',
  cristina: 'Cristina',
  fernanda: 'Fernanda',
  leticia: 'Letícia',
  amanda: 'Amanda',
  bruna: 'Bruna',
  jessica: 'Jéssica',
  carol: 'Carol',
  carolina: 'Carolina',
  caroline: 'Caroline',
  gabriela: 'Gabriela',
  vanessa: 'Vanessa',
  mariana: 'Mariana',
  beatriz: 'Beatriz',
  larissa: 'Larissa',
  luana: 'Luana',
  rebeca: 'Rebeca',
  alice: 'Alice',
  manuela: 'Manuela',
  isadora: 'Isadora',
  helena: 'Helena',
  valentina: 'Valentina',
  sophia: 'Sophia',
  sofia: 'Sofia',
  clara: 'Clara',
  lorena: 'Lorena',
  cecilia: 'Cecília',
  isabel: 'Isabel',
  isabela: 'Isabela',
  isabella: 'Isabella',
  teresa: 'Teresa',
  thereza: 'Thereza',
  regina: 'Regina',
  daniela: 'Daniela',
  eliane: 'Eliane',
  elizabeth: 'Elizabeth',
  elisabete: 'Elisabete',
  gisele: 'Gisele',
  giselle: 'Giselle',
  tatiane: 'Tatiane',
  tatiana: 'Tatiana',
  debora: 'Débora',
  monica: 'Mônica',
  simone: 'Simone',
  andreia: 'Andréia',
  andrea: 'Andréa',
  solange: 'Solange',
  valeria: 'Valéria',
  gloria: 'Glória',
  flavia: 'Flávia',
  silvia: 'Sílvia',
  terezinha: 'Terezinha',
  aparecida: 'Aparecida',
  lourdes: 'Lourdes',
  neusa: 'Neusa',
  neuza: 'Neuza',
  irene: 'Irene',
  cleusa: 'Cleusa',
  ines: 'Inês',
  margarida: 'Margarida',
  leonor: 'Leonor',
  iracema: 'Iracema',
  alzira: 'Alzira',
  celia: 'Célia',
  eunice: 'Eunice',
  olivia: 'Olívia',
  lia: 'Lia',
  maisa: 'Maisa',
  maite: 'Maitê',
  antonela: 'Antonela',
  liz: 'Liz',
  eloah: 'Eloah',
  elis: 'Elis',

  // --- Títulos Profissionais ---
  dr: 'Dr.',
  dra: 'Dra.',
  prof: 'Prof.',
  profa: 'Profa.',

  // --- Sufixos de Parentesco e Termos de Ligação ---
  sao: 'São',
  santo: 'Santo',
  santa: 'Santa',
  junior: 'Júnior',
  neto: 'Neto',
  filho: 'Filho',
  sobrinho: 'Sobrinho',
  segundo: 'Segundo',
  terceiro: 'Terceiro'
};

// Siglas de Conselhos e Unidades de Saúde que devem permanecer SEMPRE em caixa alta
const KEEP_UPPERCASE = new Set([
  'crm', 'crmv', 'cro', 'coren', 'crefito', 'crf', 'crn', 'crp', 'sus', 'ubs', 'upa', 'uti'
]);

/**
 * Normaliza uma única palavra baseando-se nas regras de preposição, dicionário ou capitalização padrão.
 */
const capitalizeWord = (word: string): string => {
  if (!word) return '';
  const prepositions = ['da', 'de', 'do', 'das', 'dos', 'e'];

  if (prepositions.includes(word)) return word;
  if (KEEP_UPPERCASE.has(word)) return word.toUpperCase();

  // Normalização defensiva para busca no dicionário (remove acentos apenas para buscar a chave correspondente)
  const wordNormalized = word.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const nomeCorrigido = DICIONARIO_NOMES[wordNormalized];

  if (nomeCorrigido) return nomeCorrigido;

  return word.charAt(0).toUpperCase() + word.slice(1);
};

/**
 * Formata o nome do paciente ou profissional de saúde aplicando a capitalização correta,
 * tratando preposições em minúsculo, hifens e acentuação de dicionário.
 */
const capitalizeName = (name: string): string => {
  if (!name) return '';

  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => {
      // Se a palavra contiver hífen (ex: jean-luc ou macedo-silva), trata individualmente cada lado
      if (word.includes('-')) {
        return word.split('-').map(capitalizeWord).join('-');
      }
      return capitalizeWord(word);
    })
    .join(' ');
};

/**
 * Remove espaços em branco e padroniza e-mails para letras minúsculas.
 */
export const formatEmail = (email: string): string => {
  if (!email) return '';
  return email.toLowerCase().replace(/\s+/g, '');
};

/**
 * Capitaliza apenas a primeira letra da string e deixa o resto em minúsculo (Sentence case).
 */
export const capitalizeFirstLetter = (text: string | null | undefined): string => {
  if (!text) return '';
  const str = text.trim();
  if (str.length === 0) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

const sanitizeText = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/[^a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s.\-,/]/g, '') // Remove caracteres especiais nocivos
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Remove acentos e caracteres especiais de um texto, converte cedilha em 'C' e retorna em MAIÚSCULAS.
 * Utilizado em todos os formulários de cadastro para padronização dos dados.
 *
 * @param texto - Texto bruto digitado pelo usuário
 * @returns Texto normalizado em maiúsculas sem acentos (ç → C)
 *
 * @example
 *   normalizarEntradaTexto('João da Conceição')  // → 'JOAO DA CONCEICAO'
 *   normalizarEntradaTexto('Ângela Ênio')         // → 'ANGELA ENIO'
 */
export const normalizarEntradaTexto = (texto: string): string => {
  if (!texto) return '';
  return texto
    .normalize('NFD')
    // Remove marcas de acento/diacrítico (exceto cedilha que é tratado separado)
    .replace(/[\u0300-\u036f]/g, '')
    // Cedilha pode aparecer como ç/Ç direto (sem decompor via NFD)
    .replace(/[çÇ]/g, (c) => c === 'ç' ? 'c' : 'C')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Valida se o nome digitado não é abreviado.
 * Regra: cada parte do nome deve ter pelo menos 2 letras.
 *
 * @param nome - Nome já normalizado (ou não)
 * @returns true se o nome é válido (sem abreviações), false caso contrário
 *
 * @example
 *   validarNomeCompleto('JOAO SILVA')    // → true
 *   validarNomeCompleto('J SILVA')       // → false  (primeira parte abreviada)
 *   validarNomeCompleto('JOAO S')        // → false  (segunda parte abreviada)
 */
export const validarNomeCompleto = (nome: string): boolean => {
  if (!nome || !nome.trim()) return false;
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  // Deve ter pelo menos 2 partes (nome + sobrenome)
  if (partes.length < 2) return false;
  // Cada parte deve ter pelo menos 2 letras (sem abreviação)
  return partes.every(parte => parte.length >= 2);
};

/**
 * Formata CPF (11 dígitos) ou CNS (15 dígitos). 
 * Se o tamanho for inválido, retorna apenas os dígitos originais higienizados.
 */
const formatDocument = (doc: string): string => {
  if (!doc) return '';
  const cleanDoc = doc.replace(/\D/g, ''); // Remove tudo que não for número

  if (cleanDoc.length === 11) {
    // Retorna formatado como CPF: 000.000.000-00
    return cleanDoc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  if (cleanDoc.length === 15) {
    // Retorna formatado como Cartão Nacional de Saúde (CNS): 000 0000 0000 0000
    return cleanDoc.replace(/(\d{3})(\d{4})(\d{4})(\d{4})/, '$1 $2 $3 $4');
  }

  return cleanDoc;
};

/**
 * Retorna as iniciais do nome (até duas letras) em maiúsculo.
 */
export const getInitials = (name: string | null | undefined, fallback: string = 'US'): string => {
  if (!name) return fallback;
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

/**
 * Retorna classes CSS de cores padronizadas baseadas no hash do nome do usuário.
 */
export const getAvatarColor = (name: string | null | undefined): string => {
  if (!name) return 'bg-slate-100 text-slate-700 border-slate-200';
  const colors = [
    'bg-blue-100 text-blue-700 border-blue-200',
    'bg-emerald-100 text-emerald-700 border-emerald-200',
    'bg-amber-100 text-amber-700 border-amber-200',
    'bg-rose-100 text-rose-700 border-rose-200',
    'bg-purple-100 text-purple-700 border-purple-200',
    'bg-indigo-100 text-indigo-700 border-indigo-200',
    'bg-cyan-100 text-cyan-700 border-cyan-200',
    'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
    'bg-teal-100 text-teal-700 border-teal-200',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

/**
 * Verifica se um dado (CPF, Telefone, Registro, etc) parece ser inválido ou "placeholder" (ex: 999999999, 123456, 01/01/1900).
 */
export const isSuspiciousData = (value: string | null | undefined): boolean => {
  if (!value) return false;
  
  // Verifica datas de nascimento genéricas (placeholders comuns)
  if (value.includes('1900-01-01') || value.includes('01/01/1900') || value.includes('01/01/2000') || value.includes('2000-01-01')) {
    return true;
  }

  const digitsOnly = value.replace(/\D/g, '');
  if (digitsOnly.length < 4) return false; // Muito curto para avaliar
  
  // Repetição do mesmo dígito (ex: 00000, 99999) 5+ vezes seguidas
  if (/(\d)\1{4,}/.test(digitsOnly)) return true;
  
  // Sequenciais óbvios (ex: 123456, 987654)
  const sequentialPatterns = ['123456', '234567', '345678', '456789', '567890', '987654', '876543', '765432', '654321'];
  if (sequentialPatterns.some(pattern => digitsOnly.includes(pattern))) return true;

  return false;
};