import type { Song } from '../shared/types'

export type Slot = 'morning' | 'noon' | 'afternoon' | 'evening' | 'night'

export function slotOf(d: Date): Slot {
  const h = d.getHours()
  if (h >= 5 && h < 11) return 'morning'
  if (h >= 11 && h < 14) return 'noon'
  if (h >= 14 && h < 18) return 'afternoon'
  if (h >= 18 && h < 22) return 'evening'
  return 'night'
}

const ANYTIME = [
  '白天有说有笑，晚上睡个好觉。',
  '好好吃饭，好好睡觉，好好爱自己。',
  '慢慢来，比较快。',
  '日子常新，未来不远。',
  '允许一切发生，然后慢慢变好。',
  '你已经做得很好了。',
  '不必事事圆满，平安喜乐就好。',
  '万事尽心尽力，而后顺其自然。',
  '生活明朗，万物可爱。',
  '人间值得，未来可期。',
  '心里有光，慢食三餐。',
  '别着急，好事都在路上。',
  '一切都会好起来的，即使不是在今天。',
  '认真生活，就能找到被生活藏起来的糖果。',
  '累了就歇一歇，没有人规定要一直往前跑。',
  '知足且上进，温柔而坚定。',
  '保持热爱，奔赴山海。',
  '愿你眼里有光，心中有爱。',
  '所求皆如愿，所行化坦途。',
  '把今天过好，就是对明天最好的准备。',
  '事情一件一件做，日子一天一天过。',
  '你不需要每条消息都秒回，世界不会因此停转。',
  '对自己温柔一点，你也是第一次过今天。',
  '小事不慌，大事不乱，其余的交给时间。',
  '平平淡淡的日子里，也藏着很多小确幸。',
  '愿你忙而不乱，累而不倦。',
  '今天的辛苦，都会变成以后的底气。',
  '保持微笑，好运自然来。'
]

const BY_SLOT: Record<Slot, string[]> = {
  morning: [
    '早安。新的一天，从好心情开始。',
    '太阳出来了，今天也会有好事发生。',
    '早饭吃了吗？吃饱了才有力气对付今天。',
    '今天也是值得期待的一天。'
  ],
  noon: [
    '午饭要好好吃，这是今天最重要的事之一。',
    '中午眯一会儿吧，下午的你会感谢现在的你。',
    '忙了一上午，先停下来喘口气。'
  ],
  afternoon: [
    '下午容易犯困，起来走两步，喝口水。',
    '再坚持一下，离下班又近了一点。',
    '窗外的光正好，抬头看一眼吧。'
  ],
  evening: [
    '下班了，把工作留在工位上。',
    '辛苦了，今天的你值得一顿好吃的。',
    '今天能做完的已经做完了，剩下的明天再说。',
    '回家的路上，听首喜欢的歌吧。'
  ],
  night: [
    '晚安，好梦。今天的事今天了，明天的事明天说。',
    '早点睡，月亮会替你守着今晚。',
    '夜深了，放下手机，睡个好觉。',
    '今天辛苦了，剩下的交给明天的太阳。'
  ]
}

function seeded(seed: number): () => number {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

function dayKey(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

export function quotesFor(d: Date, count = 6): string[] {
  const slot = slotOf(d)
  const rnd = seeded(dayKey(d) * 7 + slot.length)
  const pick = (arr: string[], n: number): string[] =>
    [...arr]
      .map((q) => ({ q, k: rnd() }))
      .sort((a, b) => a.k - b.k)
      .slice(0, n)
      .map((x) => x.q)
  const fromSlot = pick(BY_SLOT[slot], 2)
  const rest = pick(ANYTIME, count - fromSlot.length)
  const out = [fromSlot[0]]
  rest.forEach((q, i) => {
    out.push(q)
    if (i === 1 && fromSlot[1]) out.push(fromSlot[1])
  })
  return out.slice(0, count)
}

const SONGS: Song[] = [
  { title: '暖暖', artist: '梁静茹', why: '和我同名的一首歌，想第一个送给你。' },
  { title: '稳稳的幸福', artist: '陈奕迅', why: '日子不用轰轰烈烈，稳稳的就很好。' },
  { title: '小情歌', artist: '苏打绿', why: '旋律很轻，适合让脑子放空三分钟。' },
  { title: '平凡的一天', artist: '毛不易', why: '平凡的一天，其实也挺珍贵的。' },
  { title: '旅行的意义', artist: '陈绮贞', why: '人在工位，心可以先出去走走。' },
  { title: '遇见', artist: '孙燕姿', why: '听到前奏，心情就会亮一点。' },
  { title: '温柔', artist: '五月天', why: '今天也请对自己温柔一点。' },
  { title: '晴天', artist: '周杰伦', why: '不管窗外什么天气，耳机里是晴天。' },
  { title: '小幸运', artist: '田馥甄', why: '愿你今天也能碰到一点小幸运。' },
  { title: '慢慢喜欢你', artist: '莫文蔚', why: '慢一点没关系，好的东西都慢。' },
  { title: '夜空中最亮的星', artist: '逃跑计划', why: '累的时候听，会觉得还能再走一段。' },
  { title: '这世界那么多人', artist: '莫文蔚', why: '忙碌的一天里，留一首歌的时间给自己。' },
  { title: '起风了', artist: '买辣椒也用券', why: '适合下班路上，风吹过来的时候听。' },
  { title: '如果有来生', artist: '谭维维', why: '想象一下草原和风，肩膀会松下来。' }
]

export function songFor(d: Date): Song {
  const start = Date.UTC(d.getFullYear(), 0, 1)
  const dayOfYear = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 86400000)
  return SONGS[dayOfYear % SONGS.length]
}

export function songUrl(song: Song, app: 'netease' | 'qq'): string {
  const q = encodeURIComponent(`${song.title} ${song.artist}`)
  return app === 'qq'
    ? `https://y.qq.com/n/ryqq/search?w=${q}`
    : `https://music.163.com/#/search/m/?s=${q}`
}

export const CARE_TEXT: Record<string, string[]> = {
  longFocus: [
    '你已经连续忙了两个小时，起来接杯水，活动一下肩膀吧。',
    '盯屏幕很久了，看看远处，让眼睛歇一会儿。'
  ],
  busyDay: [
    '今天找你的人特别多，辛苦了。不急的那些我先替你挡着。',
    '消息有点多的一天，别慌，一件一件来，我帮你排好了顺序。'
  ],
  lunch: ['到饭点了，先去吃饭吧，消息我看着。', '该吃午饭了，吃饱了下午才有力气。'],
  friday: ['周五啦，再撑一小会儿就是周末。', '这周辛苦了，收个尾，周末好好休息。'],
  late: ['已经很晚了，今天做得够多了，早点回去吧。', '夜深了，剩下的明天再说，身体要紧。'],
  cleared: ['紧急的事都处理完了，你可以松口气了。', '眼下没有急事了，奖励自己歇五分钟吧。']
}
