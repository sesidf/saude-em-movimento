// Máscaras para formatação de dados

export const maskCPF = (value: string | null | undefined): string => {
  if (!value) return '';
  return value
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1');
};

export const censorCPF = (value: string | null | undefined): string => {
  if (!value) return '';
  if (value.includes('*')) return value;
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length !== 11) {
    if (digits.length >= 3) {
      return `***.***.${digits.slice(-3)}-**`;
    }
    return '***.***.***-**';
  }
  return `***.***.${digits.slice(6, 9)}-**`;
};

export const maskPhone = (value: string | null | undefined): string => {
  if (!value) return '';
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .replace(/(-\d{4})\d+?$/, '$1');
  }

  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .replace(/(-\d{4})\d+?$/, '$1');
};

export const censorPhone = (value: string | null | undefined): string => {
  if (!value) return '';
  if (value.includes('*')) return value;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10) return value;
  
  const ddd = digits.slice(0, 2);
  const isMobile = digits.length === 11;
  const prefix = isMobile ? `${digits.slice(2, 3)}****` : '****';
  const suffix = digits.slice(-4);
  
  return `(${ddd}) ${prefix}-${suffix}`;
};

const censorEmail = (value: string): string => {
  if (!value || !value.includes('@')) return value;
  const [local, domain] = value.split('@');
  if (local.length <= 2) return `***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
};

export const maskCEP = (value: string | null | undefined): string => {
  if (!value) return '';
  return value
    .replace(/\D/g, '')
    .slice(0, 8)
    .replace(/(\d{5})(\d)/, '$1-$2');
};

export const maskCNPJ = (value: string | null | undefined): string => {
  if (!value) return '';
  return value
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1');
};

export const unmaskCPF = (value: string): string => {
  return value.replace(/\D/g, '');
};

export const unmaskPhone = (value: string): string => {
  return value.replace(/\D/g, '');
};

export const unmaskCNPJ = (value: string): string => {
  return value.replace(/\D/g, '');
};

export const validateCPF = (cpf: string): boolean => {
  cpf = unmaskCPF(cpf);
  if (cpf.length !== 11) return false;
  
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  
  let sum = 0;
  let remainder;
  
  for (let i = 1; i <= 9; i++) {
    sum = sum + parseInt(cpf.substring(i - 1, i)) * (11 - i);
  }
  
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf.substring(9, 10))) return false;
  
  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum = sum + parseInt(cpf.substring(i - 1, i)) * (12 - i);
  }
  
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf.substring(10, 11))) return false;
  
  return true;
};

export const validateEmail = (email: string): boolean => {
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email.trim());
};

export const validatePhone = (phone: string): boolean => {
  const digits = unmaskPhone(phone);
  if (digits.length !== 10 && digits.length !== 11) return false;
  
  // Não permitir números repetidos (ex: 00000000000, 11111111111)
  if (/^(\d)\1+$/.test(digits)) return false;

  return true;
};

export const validateCNPJ = (cnpj: string): boolean => {
  const cleaned = unmaskCNPJ(cnpj);
  if (cleaned.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cleaned)) return false;

  const calculateDigit = (base: string, factors: number[]) => {
    const sum = base
      .split('')
      .reduce((acc, digit, idx) => acc + Number(digit) * factors[idx], 0);

    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const base = cleaned.slice(0, 12);
  const digit1 = calculateDigit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const digit2 = calculateDigit(`${base}${digit1}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return cleaned === `${base}${digit1}${digit2}`;
};