import type { RawMsg } from './classify'

interface Script {
  minsAgo: number
  chat: string
  type: 'p2p' | 'group'
  sender: string
  text: string
  at?: boolean
}

const H = 60

const HISTORY: Script[] = [
  { minsAgo: 3 * 24 * H + 200, chat: '王磊', type: 'p2p', sender: '王磊', text: '订单接口的字段文档发我一份吧，我这边好开始对接' },
  { minsAgo: 3 * 24 * H + 90, chat: '支付项目群', type: 'group', sender: '陈静', text: '@你 支付回调的方案评审定在周三下午三点，你来主讲可以吗？', at: true },
  { minsAgo: 2 * 24 * H + 300, chat: '赵敏', type: 'p2p', sender: '赵敏', text: '上周的数据看板有个口径问题，方便的时候帮我看一下' },
  { minsAgo: 2 * 24 * H + 120, chat: '支付项目群', type: 'group', sender: '刘洋', text: '测试环境今晚十点维护，请周知' },
  { minsAgo: 26 * H, chat: '李娜', type: 'p2p', sender: '李娜', text: '退款流程的异常分支你补一下用例，明天下班前给我可以吗？' },
  { minsAgo: 25 * H, chat: '技术部大群', type: 'group', sender: '行政小助手', text: '本周五下午茶：奶茶和水果，三点在茶水间领取' },
  { minsAgo: 6 * H, chat: '技术部大群', type: 'group', sender: '周婷', text: '有人知道会议室 B 的投影怎么连吗' },
  { minsAgo: 5 * H + 20, chat: '支付项目群', type: 'group', sender: '刘洋', text: '我把昨天的压测报告放到文档里了，大家有空可以看看' },
  { minsAgo: 4 * H + 40, chat: '赵敏', type: 'p2p', sender: '赵敏', text: '看板那个口径问题不急，这周内帮我确认一下就行' },
  { minsAgo: 4 * H, chat: '支付项目群', type: 'group', sender: '陈静', text: '收到' },
  { minsAgo: 3 * H + 30, chat: '技术部大群', type: 'group', sender: '孙浩', text: '哈哈哈哈这个表情包太真实了' },
  { minsAgo: 3 * H, chat: '张伟', type: 'p2p', sender: '张伟', text: '下周的排期表我初步排了一版，你看下有没有冲突，周五前回我就行' },
  { minsAgo: 2 * H + 30, chat: '前端协作群', type: 'group', sender: '何琳', text: '新版登录页的埋点方案更新了，相关同学可以看一下' },
  { minsAgo: 2 * H, chat: '支付项目群', type: 'group', sender: '刘洋', text: '中午一起吃饭吗，楼下新开了家面馆' },
  { minsAgo: 95, chat: '李娜', type: 'p2p', sender: '李娜', text: '用例我看了，写得挺细的，谢谢' },
  { minsAgo: 70, chat: '技术部大群', type: 'group', sender: '行政小助手', text: '提醒：本月报销单请在 25 号前提交' },
  { minsAgo: 48, chat: '王磊', type: 'p2p', sender: '王磊', text: '接口联调的结论今天下午 5 点前能给我吗？我要同步给客户' },
  { minsAgo: 30, chat: '前端协作群', type: 'group', sender: '何琳', text: '@你 登录页的错误码对照表你那边有最新的吗？有的话发群里', at: true },
  { minsAgo: 21, chat: '支付项目群', type: 'group', sender: '陈静', text: '@你 明天评审会的时间需要你确认一下，会议室我先占着', at: true },
  { minsAgo: 8, chat: '王磊', type: 'p2p', sender: '王磊', text: '在吗？联调结论那个比较急，客户又来问了' }
]

const LIVE: Omit<Script, 'minsAgo'>[] = [
  { chat: '技术部大群', type: 'group', sender: '孙浩', text: '下午有人拼单咖啡吗' },
  { chat: '赵敏', type: 'p2p', sender: '赵敏', text: '另外想问下，新人入职的权限申请流程是找你还是找运维？' },
  { chat: '支付项目群', type: 'group', sender: '刘洋', text: '线上支付回调出现大量超时报错，@你 麻烦马上看一下，已经影响下单了', at: true },
  { chat: '前端协作群', type: 'group', sender: '何琳', text: '好的，谢谢' },
  { chat: '张伟', type: 'p2p', sender: '张伟', text: '排期表不急哈，你先忙' },
  { chat: '李娜', type: 'p2p', sender: '李娜', text: '周五的复盘会你准备讲哪部分？我好排议程，明天上午前告诉我就行' },
  { chat: '技术部大群', type: 'group', sender: '周婷', text: '会议室 B 的投影修好了，大家可以正常用' },
  { chat: '陈静', type: 'p2p', sender: '陈静', text: '评审材料我看完了，第三部分的时序图能不能今天下班前再补一下异常分支？' }
]

function toRaw(s: Omit<Script, 'minsAgo'>, ts: number, n: number): RawMsg {
  return {
    id: `demo-${ts}-${n}`,
    chatId: 'demo-chat-' + s.chat,
    chatName: s.chat,
    chatType: s.type,
    senderId: 'demo-user-' + s.sender,
    senderName: s.sender,
    text: s.text.replace('@你 ', ''),
    ts,
    mentionsMe: !!s.at
  }
}

export function demoHistory(now: number): RawMsg[] {
  return HISTORY.map((s, i) => toRaw(s, now - s.minsAgo * 60_000, i))
}

export function demoLive(index: number, now: number): RawMsg {
  return toRaw(LIVE[index % LIVE.length], now, index)
}

export const DEMO_TRANSCRIPT = `陈静：今天主要对一下支付回调改造的方案，先请主讲人过一遍整体思路。
我：整体是把同步回调改成消息队列异步处理，失败的进重试队列，最多重试五次。
王磊：重试间隔怎么定？客户那边比较关心到账时效。
我：指数退避，第一次 5 秒，最长不超过 10 分钟。
刘洋：压测结果看，异步之后峰值吞吐提升了大概三倍，但是重试队列堆积的时候监控还没有。
陈静：那监控这块需要补上。结论先定一下：方案整体通过，采用消息队列异步处理。
李娜：测试这边需要完整的异常分支用例，尤其是重复回调和乱序的情况。
陈静：好，李娜负责补充异常用例，周四之前完成。
刘洋：我来加重试队列的堆积监控和告警，下周一之前上线。
王磊：我需要一份对客户的说明文档，讲清楚到账时效的变化。
陈静：这个请主讲人来写吧，周五之前给王磊。
我：可以，我周五前把对外说明文档发给王磊。
陈静：另外确定一下上线时间，定在下周三晚上十点的发布窗口。
王磊：没问题。
陈静：那今天就到这里，辛苦大家。`
