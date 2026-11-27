/** What people are like to live with, what they say, and what can go wrong in a house full of them. */
import type { RoomType } from './club.ts';
export type Emo = 'calm' | 'happy' | 'excited' | 'tired' | 'hungry' | 'sad' | 'anxious' | 'disgusted' | 'angry' | 'furious';
export const EMO: Record<Emo, { name: string; icon: string; col: string; face: string }> = {
  calm: { name: 'Calm', icon: 'smile', col: '#9fc2c6', face: '' },
  happy: { name: 'Happy', icon: 'laugh', col: '#6fe0a4', face: 'smile' },
  excited: { name: 'Buzzing', icon: 'zap', col: '#ffd24a', face: 'smile' },
  tired: { name: 'Tired', icon: 'moon', col: '#8aa2d8', face: 'blink' },
  hungry: { name: 'Hungry', icon: 'utensils', col: '#e8b06a', face: 'sad' },
  sad: { name: 'Low', icon: 'cloud-rain', col: '#7fa6d8', face: 'sad' },
  anxious: { name: 'On edge', icon: 'activity', col: '#d8c46a', face: 'shock' },
  disgusted: { name: 'Disgusted', icon: 'frown', col: '#9fc06a', face: 'disgust' },
  angry: { name: 'Angry', icon: 'flame', col: '#ff8a5a', face: 'angry' },
  furious: { name: 'Furious', icon: 'angry', col: '#ff4a3a', face: 'angry' },
};
export interface Quirk {
  name: string;
  desc: string;
  good?: boolean;
}
export const QUIRKS: Record<string, Quirk> = {
  slob: { name: 'Soap is optional', desc: 'Skips showers when nobody insists.' },
  messy: { name: 'Leaves a trail', desc: 'Cups, socks, wrappers. Everywhere.' },
  neat: { name: 'Tidy to the bone', desc: 'Cleans up after others, and keeps count.', good: true },
  germ: { name: 'Germ-shy', desc: 'Smells and dirt ruin the day.' },
  glutton: { name: 'Human dustbin', desc: 'Eats what is in the fridge, whoever it belongs to.' },
  skip: { name: 'Forgets to eat', desc: 'One more game, then food. Then one more.' },
  loud: { name: 'No indoor voice', desc: 'The whole house hears every call.' },
  quiet: { name: 'Keeps to themselves', desc: 'Needs silence. Talks when it matters.' },
  prank: { name: 'Prankster', desc: 'Cling film on the toilet. Every time.' },
  hot: { name: 'Short fuse', desc: 'Goes from fine to furious in one sentence.' },
  sunny: { name: 'Sunny', desc: 'Lifts a room by walking into it.', good: true },
  gossip: { name: 'Hears everything', desc: 'And repeats it.' },
  owl: { name: 'Night owl', desc: 'Alive at three, useless at nine.' },
  early: { name: 'Up at six', desc: 'Blender on by ten past.' },
  cook: { name: 'Good in the kitchen', desc: 'Feeds people when nobody else does.', good: true },
  peace: { name: 'Peacemaker', desc: 'Steps between people before it gets ugly.', good: true },
  proud: { name: 'Never wrong', desc: 'An apology would be a first.' },
  home: { name: 'Homesick', desc: 'Calls home every evening. Some evenings do not help.' },
  caff: { name: 'Runs on energy drinks', desc: 'Sharp until the crash.' },
  super: { name: 'Superstitious', desc: 'Same socks since the winning streak began.' },
};
export const QUIRK_IDS = Object.keys(QUIRKS);
/** opposites never meet in one person */
export const CLASH: [string, string][] = [
  ['slob', 'neat'],
  ['slob', 'germ'],
  ['messy', 'neat'],
  ['loud', 'quiet'],
  ['owl', 'early'],
  ['glutton', 'skip'],
  ['hot', 'peace'],
  ['hot', 'sunny'],
  ['prank', 'germ'],
];
/** one line in the house diary: a and b are people, x is anything else */
export type FeedK = keyof typeof FEED;
export const FEED = {
  chat: { t: '{a} and {b} talk about {x}.', tone: 1 },
  laugh: { t: '{a} makes {b} laugh so hard the headset falls off.', tone: 2 },
  deep: { t: '{a} tells {b} something personal. It stays between them.', tone: 2 },
  comfort: { t: '{a} notices {b} is not fine, and sits down.', tone: 2 },
  praise: { t: '{a} tells {b} that last round was clean.', tone: 1 },
  help: { t: '{a} shows {b} a trick with {x}.', tone: 1 },
  snap: { t: '{a} snaps at {b} about {x}.', tone: -1 },
  fight: { t: '{a} and {b} shout at each other about {x}. Doors are involved.', tone: -3 },
  smell: { t: '{a} tells {b} to take a shower. Everybody heard.', tone: -1 },
  smellok: { t: '{b} goes to wash after a hint from {a}.', tone: 0 },
  smellno: { t: '{b} answers that real players do not shower on match week. {a} opens a window.', tone: -2 },
  dishes: { t: '{a} finds {b}’s plates from {x}. There are words.', tone: -2 },
  cleaned: { t: '{a} cleans the {x} because nobody else will.', tone: -1 },
  stole: { t: '{b} ate {a}’s lunch. The box had a name on it.', tone: -2 },
  cooked: { t: '{a} cooks for everybody. The house goes quiet for ten minutes.', tone: 2 },
  prankok: { t: '{a} pranks {b}. Even {b} has to admit it was good.', tone: 1 },
  prankno: { t: '{a} pranks {b}. Nobody is laughing.', tone: -2 },
  noise: { t: '{a} cannot focus with {b} on the phone. Says so.', tone: -1 },
  gossip: { t: '{a} tells {b} what {x} said about them.', tone: -1 },
  peace: { t: '{a} gets {b} and {x} to shake hands.', tone: 2 },
  hangry: { t: '{a} has not eaten and it shows.', tone: -1 },
  crash: { t: '{a} falls asleep at the desk.', tone: 0 },
  rage: { t: '{a} slams the {x}. It does not survive.', tone: -3 },
  storm: { t: '{a} pulls the headset off and walks out.', tone: -3 },
  quit: { t: '{a} rage quits: bags packed, door slammed.', tone: -4 },
  back: { t: '{a} comes back and says sorry to nobody in particular.', tone: 0 },
  noshower: { t: 'Day {x} without a shower for {a}.', tone: -1 },
  queue: { t: 'Queue for the shower. {a} and {b} both swear they were first.', tone: -1 },
  call: { t: '{a} calls home and stays on the line a long time.', tone: 0 },
  inc: { t: '{x}', tone: 0 },
  mgr: { t: '{x}', tone: 0 },
} as const;
export const TOPICS = [
  'a clip from last night',
  'which keyboard sounds best',
  'the worst airport in the world',
  'whether the sofa is cursed',
  'old LAN stories',
  'a series nobody else is watching',
  'the new patch',
  'what they would do without games',
  'football',
  'whose mother cooks better',
  'the draft they would never play',
  'sleep, mostly the lack of it',
  'a dog they met outside',
  'money they do not have',
  'the interview that went wrong',
];
export const TRICKS = [
  'mouse settings',
  'a smoke line-up',
  'last-hitting under the tower',
  'breathing between rounds',
  'the coffee machine',
  'wrist stretches',
  'reading a replay',
];
export const GRIPES = [
  'a missed call',
  'chewing with an open mouth',
  'the music',
  'an old joke',
  'being late again',
  'the temperature',
  'a stolen charger',
  'yesterday’s loss',
  'tapping on the desk',
  'a look',
];
/** short lines for speech bubbles over people's heads: [opening, answer] */
export const SAY: Partial<Record<FeedK, [string, string][]>> = {
  chat: [
    ['You saw that clip?', 'Three times.'],
    ['This chair squeaks.', 'You squeak.'],
    ['New patch is a mess.', 'Best patch ever!'],
    ['Pizza or ramen?', 'Yes.'],
    ['Dream was weird.', 'Go on…'],
    ['How was the gym?', 'Ow.'],
  ],
  laugh: [
    ['…and then he reloads!', 'HAHAHA'],
    ['Watch this impression.', 'Stop, I can’t breathe!'],
  ],
  deep: [
    ['Can I tell you something?', 'Always.'],
    ['I miss home a bit.', 'Me too.'],
  ],
  comfort: [
    ['Hey. You okay?', 'Not really.'],
    ['Rough day?', 'Thanks for asking.'],
  ],
  praise: [
    ['That clutch, though.', 'Heh. Thanks.'],
    ['You carried today.', 'We all did.'],
  ],
  help: [
    ['Try it like this.', 'Oh! Smooth.'],
    ['Lower your sens.', '…that works.'],
  ],
  snap: [
    ['Could you NOT?', 'What now?!'],
    ['Focus. Please.', 'I AM focused.'],
  ],
  fight: [
    ['You never listen!', 'Because you never stop!'],
    ['Say that again.', 'Gladly.'],
    ['Unbelievable!', 'Get lost!'],
  ],
  smell: [
    ['Dude. Shower.', 'Is it that bad?'],
    ['What is that smell?', '…me?'],
  ],
  smellok: [['Towels are clean.', 'Point taken.']],
  smellno: [
    ['Water. Soap. Now.', 'After the streak.'],
    ['I’m opening a window.', 'Drama queen.'],
  ],
  dishes: [
    ['Whose plates are these?!', 'Uh…'],
    ['It’s growing fur!', 'It’s soaking.'],
  ],
  cleaned: [['I’m not your maid!', '…']],
  stole: [
    ['Where is my lunch?', 'What lunch?'],
    ['It had my NAME on it.', 'It was delicious.'],
  ],
  cooked: [
    ['Food’s ready!', 'YES!'],
    ['Careful, hot.', 'Best day ever.'],
  ],
  prankok: [['Check your chair.', 'Okay, that’s good.']],
  prankno: [['Gotcha!', 'NOT funny.']],
  noise: [['Inside voice!', 'This IS my inside voice!']],
  gossip: [['You didn’t hear it from me…', 'They said WHAT?']],
  peace: [['Both of you. Sit.', '…fine.']],
  hangry: [['I could eat a mousepad.', '']],
  rage: [
    ['ARE YOU KIDDING ME?!', ''],
    ['THIS GAME!!!', ''],
  ],
  storm: [
    ['I’m done.', 'Where are you going?'],
    ['Find someone else!', 'Wait—'],
  ],
  quit: [['I QUIT.', '']],
  queue: [['I was first!', 'In your dreams!']],
  call: [['Hi mum…', '']],
};
export const IDLE_SAY: Record<string, string[]> = {
  scrim: ['Two mid!', 'Nice try.', 'Rotate!', 'One more.', 'My bad.', 'Good half.'],
  aim: ['Head level…', 'Warm now.', '412 again.', 'Wrist hurts.'],
  tactics: ['What if we fake?', 'Too slow.', 'Draw it again.', 'That’s it!'],
  vod: ['Pause there.', 'See my angle?', 'We were blind.', 'Again.'],
  gym: ['Two… more…', 'Legs. Gone.', 'Water.'],
  mind: ['Breathe in…', 'Okay.', 'Feels lighter.'],
  bond: ['Rematch!', 'Cheater!', 'Haha!', 'Who’s next?'],
  stream: ['Hi chat!', 'Clip it!', 'Thanks for the sub!'],
  rest: ['Five minutes…', 'Zzz', 'What’s for dinner?'],
};
/** what people say while it is happening */
export const FX_SAY: Record<string, string[]> = {
  dark: ['Who touched it?', 'I was winning that.', 'Ow. Ow!', 'Is it the whole street?', 'My save…', 'Torch, anyone?'],
  offline: ['I’m red.', 'Ping nine thousand.', 'Is it just me?', 'Restart the router.', 'Restart it again.'],
  water: ['My socks!', 'Lift the cables!', 'Where is it coming from?', 'Not the PC. NOT the PC.'],
  smoke: ['Open a window!', 'It’s fine. It’s toast.', 'That was dinner.', 'Who was cooking?'],
  hot: ['I am melting.', 'My hands slip.', 'Thirty-four degrees.', 'Somebody smells.'],
  bugs: ['It MOVED.', 'On the table. On the TABLE.', 'I’m not going in there.', 'There are more.'],
  alarm: ['Did you see him?', 'My keyboard is gone.', 'Who left it open?', 'Call somebody.'],
  party: ['Tune!', 'Cake?', 'Turn it up!', 'Just one dance.'],
};
export interface HouseRules {
  /** who cooks: 0 everybody for themselves, 1 groceries paid, 2 catered */
  meals: 0 | 1 | 2;
  rota: boolean;
  hygiene: boolean;
  quiet: boolean;
  curfew: boolean;
}
export const HOUSE: { k: Exclude<keyof HouseRules, 'meals'>; name: string; desc: string; cost: string }[] = [
  {
    k: 'rota',
    name: 'Cleaning rota',
    desc: 'Everybody has a day. Tidy people love it, messy ones sulk.',
    cost: 'Less mess, a little resentment',
  },
  {
    k: 'hygiene',
    name: 'Shower before practice',
    desc: 'Posted on the door. Works best with a bathroom.',
    cost: 'Cleaner people, proud ones feel treated like children',
  },
  { k: 'quiet', name: 'Quiet hours after ten', desc: 'No calls, no music, no blender.', cost: 'Better sleep, less fun' },
  { k: 'curfew', name: 'Lights out at one', desc: 'Router off at one in the morning.', cost: 'More energy, night owls hate it' },
];
export const MEALS: [string, string, number][] = [
  ['For yourself', 'Everybody eats what they find.', 0],
  ['Groceries', 'A full fridge. Somebody still has to cook.', 28],
  ['Catered', 'Proper food twice a day, on time.', 74],
];
export const ROOM_NAME: Partial<Record<RoomType, string>> = {
  practice: 'practice room',
  kitchen: 'kitchen',
  lounge: 'lounge',
  bath: 'bathroom',
  dorm: 'dorm',
  gym: 'gym',
  strategy: 'strategy room',
};
