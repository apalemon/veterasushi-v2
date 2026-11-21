const HEARTBEAT_TTL_MS = 2 * 60 * 1000;

const DAYS_BY_WEEKDAY = {
  Sunday: 'domingo',
  Monday: 'segunda',
  Tuesday: 'terca',
  Wednesday: 'quarta',
  Thursday: 'quinta',
  Friday: 'sexta',
  Saturday: 'sabado'
};

function criarHorariosPadrao() {
  const diaAberto = { aberto: true, abertura: '19:00', fechamento: '23:30' };
  return {
    ativo: true,
    fuso: 'America/Sao_Paulo',
    statusManual: null,
    dias: {
      domingo: { aberto: false, abertura: '19:00', fechamento: '23:30' },
      segunda: { ...diaAberto },
      terca: { ...diaAberto },
      quarta: { ...diaAberto },
      quinta: { ...diaAberto },
      sexta: { ...diaAberto },
      sabado: { ...diaAberto }
    }
  };
}

function obterTimestampHeartbeat(value) {
  if (typeof value === 'number') return value;
  return Date.parse(value);
}

function obterMinutos(horario) {
  if (typeof horario !== 'string' || !/^\d{2}:\d{2}$/.test(horario)) return null;
  const [hora, minuto] = horario.split(':').map(Number);
  if (hora > 23 || minuto > 59) return null;
  return hora * 60 + minuto;
}

function avaliarStatusLoja(horarios, agora = new Date()) {
  const timestampAgora = agora.getTime();
  const heartbeat = obterTimestampHeartbeat(horarios && horarios.gestorHeartbeatAt);
  const gestorAtivo = Number.isFinite(heartbeat) &&
    heartbeat <= timestampAgora + 30000 &&
    timestampAgora - heartbeat < HEARTBEAT_TTL_MS;

  if (!gestorAtivo) {
    return {
      aberta: false,
      gestorAtivo: false,
      mensagem: 'Loja fechada automaticamente: o Gestor está offline.'
    };
  }

  if (horarios.statusManual === false) {
    return {
      aberta: false,
      gestorAtivo: true,
      mensagem: 'Loja fechada manualmente.'
    };
  }

  if (horarios.ativo === false) {
    return { aberta: true, gestorAtivo: true, mensagem: 'Loja aberta.' };
  }

  const fuso = horarios.fuso || 'America/Sao_Paulo';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(agora);
  const values = {};
  parts.forEach(part => {
    if (part.type !== 'literal') values[part.type] = part.value;
  });

  const dia = DAYS_BY_WEEKDAY[values.weekday];
  const configDia = horarios.dias && horarios.dias[dia];
  if (!configDia || configDia.aberto !== true) {
    return {
      aberta: false,
      gestorAtivo: true,
      mensagem: dia === 'domingo' ? 'Loja fechada aos domingos.' : 'Loja fechada hoje.'
    };
  }

  const abertura = obterMinutos(configDia.abertura);
  const fechamento = obterMinutos(configDia.fechamento);
  const minutoAtual = Number(values.hour) * 60 + Number(values.minute);
  if (abertura === null || fechamento === null || fechamento <= abertura) {
    return {
      aberta: false,
      gestorAtivo: true,
      mensagem: 'Horário de funcionamento inválido.'
    };
  }

  if (minutoAtual < abertura) {
    return {
      aberta: false,
      gestorAtivo: true,
      mensagem: `Abrimos hoje às ${configDia.abertura}.`
    };
  }
  if (minutoAtual >= fechamento) {
    return {
      aberta: false,
      gestorAtivo: true,
      mensagem: `A loja fechou às ${configDia.fechamento}.`
    };
  }

  return {
    aberta: true,
    gestorAtivo: true,
    mensagem: 'Loja aberta.',
    proximoFechamento: configDia.fechamento
  };
}

module.exports = {
  HEARTBEAT_TTL_MS,
  criarHorariosPadrao,
  avaliarStatusLoja
};
