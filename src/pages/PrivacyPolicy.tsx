import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6 md:p-12 font-sans text-slate-800">
      <div className="max-w-3xl mx-auto bg-white rounded-3xl shadow-sm border border-slate-200 p-8 md:p-12">
        <button 
          onClick={() => navigate(-1)} 
          className="flex items-center gap-2 text-[#00427A] font-bold hover:text-[#3CA2C8] transition-colors mb-8 text-sm uppercase tracking-wider"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>

        <h1 className="text-3xl font-black text-[#00427A] mb-8 tracking-tight">Política de Privacidade</h1>
        
        <div className="space-y-6 text-sm leading-relaxed text-slate-600">
          <p>
            Bem-vindo ao <strong>Saúde em Movimento</strong>. Esta Política de Privacidade explica como coletamos, usamos, armazenamos e protegemos os seus dados pessoais e operacionais durante o uso de nossa plataforma, em conformidade com a Lei Geral de Proteção de Dados (LGPD).
          </p>

          <h2 className="text-xl font-bold text-slate-800 mt-8 mb-4">1. Coleta e Uso de Dados</h2>
          <p>
            Coletamos apenas os dados básicos necessários para apoio operacional e assistência em saúde. Isso inclui:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Dados de identificação pessoal e de acesso (nome, e-mail, CPF, gênero, perfil funcional).</li>
            <li>Registros de acesso (logs de atividades, horários, endereço IP) para auditoria e garantia de segurança do sistema.</li>
            <li>Informações operacionais e clínicas estritamente necessárias para a gestão do prontuário eletrônico e agendamento de consultas.</li>
          </ul>

          <h2 className="text-xl font-bold text-slate-800 mt-8 mb-4">2. Finalidade do Tratamento</h2>
          <p>
            Os dados coletados são utilizados de forma transparente e exclusiva para:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Garantir a autenticação e acesso seguro à plataforma corporativa.</li>
            <li>Gerenciar prontuários eletrônicos, agendamentos de consultas e rotinas oficiais de assistência médica.</li>
            <li>Manter o apoio operacional contínuo aos profissionais de saúde (médicos, enfermeiros) e equipe administrativa.</li>
            <li>Geração de relatórios operacionais consolidados e cumprimento de obrigações legais e regulatórias aplicáveis à área da saúde.</li>
          </ul>

          <h2 className="text-xl font-bold text-slate-800 mt-8 mb-4">3. Proteção, Acesso e Segurança</h2>
          <p>
            Este é um <span className="font-bold text-slate-700">sistema restrito e seguro</span>. O acesso é exclusivo a profissionais de saúde e colaboradores autorizados, limitando-se às funcionalidades pertinentes ao seu perfil. Adotamos medidas técnicas e organizacionais rigorosas (como controle de acesso baseado em roles, anonimização de CPFs em tela e conexões criptografadas) para proteger as suas informações contra acessos não autorizados, vazamentos ou uso indevido.
          </p>

          <h2 className="text-xl font-bold text-slate-800 mt-8 mb-4">4. Retenção e Direitos do Titular</h2>
          <p>
            Como titular dos dados, você tem direito a solicitar acesso, correção, anonimização ou bloqueio dos seus dados, conforme os termos da LGPD. Vale ressaltar que informações referentes a históricos médicos e registros de atendimento (prontuários, laudos e prescrições) são armazenadas e mantidas conforme as diretrizes do Conselho Federal de Medicina (CFM) e do Ministério da Saúde, o que impede legalmente a sua eliminação precoce.
          </p>

          <div className="mt-12 p-5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 font-medium">
            Última atualização: Julho de 2026. Revisão vinculada ao projeto Saúde em Movimento.
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
