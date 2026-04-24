export const T = {
  gold: 'Золото',
  wood: 'Дерево',
  food: 'Еда',

  peasant: 'Крестьянин',
  footman: 'Пехотинец',
  archer: 'Лучник',

  townhall: 'Ратуша',
  barracks: 'Казармы',
  farm: 'Ферма',
  tower: 'Башня',

  tree: 'Дерево',
  goldmine: 'Шахта',

  hp: 'Здор',
  atk: 'Атк',
  arm: 'Брон',
  rng: 'Дальн',

  idle: 'Ожидание',
  moving: 'Движение',
  attackMoving: 'Атака-движ.',
  attacking: 'Атака',
  gathering: 'Добыча',
  returning: 'Возврат',
  building_state: 'Стройка',
  patrol: 'Патруль',
  hold: 'Держать',
  repair: 'Ремонт',
  dead: 'Мёртв',

  nothingSelected: 'Ничего не выделено. Выделите юнитов или нажмите на здание.',
  ready: 'Готово',
  building_progress: 'Строится',
  queue: 'Очередь',
  stock: 'Запас',
  selected: 'Выделено',
  idleWorkers: 'Свободные работники',

  pause: 'ПАУЗА',
  pressSpaceToResume: 'Нажмите SPACE для продолжения',

  settings: 'Настройки',
  musicVolume: 'Музыка',
  effectsVolume: 'Эффекты',
  voiceVolume: 'Голоса',
  fullscreen: 'Полный экран',
  fullscreenOn: 'Вкл',
  fullscreenOff: 'Выкл',
  close: 'Закрыть',

  gameTitle: 'RTS WARCRAFT',
  startGame: 'Начать игру',
  menuHint: 'Enter / Space / клик',
  finalHint: 'Enter / Space',

  attackMove: 'АТАКА-ДВИЖЕНИЕ (ПКМ для цели)',
  attackMoveShort: 'Атака-движ.',
  patrolMode: 'ПАТРУЛЬ: Кликните две точки (ПКМ)',
  patrolSecondPoint: 'ПАТРУЛЬ: Кликните вторую точку (ПКМ)',
  patrolShort: 'Патруль',
  stop: 'Стой',
  holdPosition: 'Держать',
  holdShort: 'Позиция',
  repairCmd: 'Ремонт',

  attackMoveNotif: 'Атака-движение!',
  patrolSetNotif: 'Патруль установлен!',
  rallyPointSet: 'Точка сбора установлена',
  buildingNotif: 'Строим',
  buildingComplete: 'Постройка завершена!',
  trainedNotif: 'обучен!',
  underAttack: 'Мы под атакой!',
  baseUnderAttack: 'База под атакой!',
  gameStarted: 'Игра началась! Стройте, добывайте, побеждайте!',
  controlGroupSet: 'Группа',
  notEnoughResources: 'Недостаточно ресурсов',
  notEnoughFood: 'Недостаточно еды',
  queueFull: 'Очередь заполнена',

  victory: 'ПОБЕДА',
  defeat: 'ПОРАЖЕНИЕ',
  gameTime: 'Время игры',
  kills: 'Убийства',
  buildingsStat: 'Постройки',
  playAgain: 'Играть снова',

  helpText: 'ЛКМ выделить  ПКМ/Option+ЛКМ команда  колесо/тачпад прокрутка  Cmd+колесо зум\nТач: тап выделить, долгий тап команда, два пальца пан/зум  A/P/H/R режимы  Space пауза\nCtrl+1..9 группа  ` свободный  Esc отмена  Ctrl+Shift+L логи',
};

export function unitName(kind: string): string {
  const map: Record<string, string> = {
    peasant: T.peasant, footman: T.footman, archer: T.archer,
  };
  return map[kind] ?? kind;
}

export function buildingName(kind: string): string {
  const map: Record<string, string> = {
    townhall: T.townhall, barracks: T.barracks, farm: T.farm, tower: T.tower,
  };
  return map[kind] ?? kind;
}
