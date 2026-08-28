interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Logo = ({ className = '', size = 'md' }: LogoProps) => {
  const sizes = {
    sm: 'h-6',
    md: 'h-8',
    lg: 'h-14',
  };

  const sizeClass = sizes[size];

  return (
    <img
      src="/images/logo2.png"
      alt="Saúde em Movimento"
      className={`${sizeClass} w-auto object-contain ${className}`}
      loading="eager"
      decoding="sync"
    />
  );
};
