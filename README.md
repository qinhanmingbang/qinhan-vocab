# 专八词汇测验（Supabase + GitHub Pages 版）

手机优先的单词测验网页。登录后，**做过的题、错题本、奖金、每轮成绩**都保存在 Supabase 数据库里，刷新页面、换手机、换浏览器登录同一个账号，记录都在。

## 文件说明

```
qinhan-vocab/
├─ index.html          页面结构
├─ style.css           样式
├─ app.js              全部逻辑（登录、出题、同步、错题本）
├─ words.js            词库（3929 个词）
├─ config.js           ← 你只需要改这一个文件
└─ supabase/
   └─ schema.sql       ← 在 Supabase 里运行一次的建表脚本
```

## 它是怎么工作的

- 网页是纯静态的，放在 GitHub Pages 上，不需要服务器。
- 浏览器直接连 Supabase：登录用 Supabase Auth，数据存在 3 张表里。
  - `word_progress`：每个单词一行，记录做过几次、对几次、错几次、是否在错题本。有记录就代表“做过了”。
  - `rounds`：每一轮的成绩和奖金。
  - `profiles`：累计奖金、最高分、完成轮数。
- 每答一题就上传一次；断网时先存在本机，联网后自动补传（右上角小圆点：绿 = 已同步，红 = 待同步）。
- 数据安全靠“行级安全（RLS）”：每个账号只能读写自己的行，别人的看不到。

---

## 第 1 步：在 Supabase 建表（约 3 分钟）

1. 打开 <https://supabase.com/dashboard>，进入你已有的项目。
2. 左侧菜单点 **SQL Editor** → 点 **New query**。
3. 用文本编辑器打开 `supabase/schema.sql`，**全选复制**，粘贴到查询框里。
4. 点右下角 **Run**。看到 `Success. No rows returned` 就成功了。
5. 左侧点 **Table Editor**，应该能看到 `profiles`、`word_progress`、`rounds` 三张表。
6. 点 **Authentication**（左侧小人图标）→ **Sign In / Providers**（旧版叫 Providers）→ 点开 **Email**：
   - 确认 Email 登录是开启的。
   - **Confirm email（注册后需要邮箱验证）建议先关掉**。关掉后，注册完立刻就能登录。开着的话，每个新用户都要收邮件点链接，而 Supabase 自带的邮件服务发送次数有限，国内邮箱还可能收不到。
   - 点 Save。

> 后台界面偶尔改版，菜单名字可能略有不同，找“Authentication → Email”这条线就行。

## 第 2 步：把钥匙填进 config.js（约 1 分钟）

1. Supabase 左下角点 **Project Settings**（齿轮）→ **API**。也可以点页面顶部的 **Connect** 按钮。
2. 复制两样东西：
   - **Project URL**，形如 `https://abcdefgh.supabase.co`
   - **anon public key**（长长的 `eyJ…` 开头）。新版后台叫 **publishable key**（`sb_publishable_…` 开头），两种都能用。
3. 用文本编辑器打开 `config.js`，把 `YOUR-PROJECT-REF` 那行和 `YOUR-ANON-KEY` 那行替换成你复制的值，保存。

```js
SUPABASE_URL: 'https://abcdefgh.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbGciOi...很长一串...',
```

> ⚠️ **千万不要填 `service_role` key 或 secret key。** 它能绕过所有权限，放到公开的 GitHub 仓库里等于把数据库交给所有人。
> anon / publishable key 是设计成可以公开的，因为有第 1 步里的行级安全保护数据。

## 第 3 步：先在本机试一下（可跳过）

不要直接双击 index.html（部分浏览器对 `file://` 限制较多）。在文件夹里打开终端运行：

```bash
python3 -m http.server 8000
```

然后浏览器打开 <http://localhost:8000>，注册一个账号试试。

## 第 4 步：上传到 GitHub 并开启 Pages（约 5 分钟）

1. 登录 GitHub，右上角 **+** → **New repository**。
   - Repository name 随便起，例如 `vocab`。
   - 选 **Public**（免费账号的 Pages 需要公开仓库）。
   - 点 **Create repository**。
2. 在新仓库页面点 **uploading an existing file**。
3. 把 `qinhan-vocab` 文件夹**里面的所有内容**拖进去：`index.html`、`style.css`、`app.js`、`words.js`、`config.js`，以及 `supabase` 文件夹。注意是拖里面的东西，不是拖外面那个文件夹，否则网址会多一层路径。
4. 拉到页面底部点 **Commit changes**。
5. 上方点 **Settings** → 左侧 **Pages**。
6. **Source** 选 **Deploy from a branch**；**Branch** 选 `main`，目录选 `/ (root)`，点 **Save**。
7. 等 1 到 2 分钟，刷新这个页面，顶部会出现你的网址：`https://你的用户名.github.io/仓库名/`。

## 第 5 步：回 Supabase 填网址（只有开了邮箱验证才需要）

**Authentication → URL Configuration**：

- **Site URL** 填你的 Pages 网址（第 4 步最后拿到的）。
- **Redirect URLs** 里添加同一个网址。

如果第 1 步关掉了 Confirm email，这一步可以跳过。

## 第 6 步：验收

1. 手机打开你的网址 → 点“注册”，用邮箱和密码注册。
2. 点“开始新一轮”，答几题，再点右上角“退出”回到首页。
3. **刷新页面** → 登录状态还在，首页显示“已做过 N 个单词”，错题本里有刚才答错的词。
4. 换另一台手机或电脑，用同一个邮箱登录 → 记录一样。
5. 在 Supabase 的 **Table Editor** 里点开 `word_progress`、`rounds`，能看到自己的数据。

---

## 玩法与规则

| 项目 | 规则 |
| --- | --- |
| 新一轮 | 每次从**没做过**的词里抽 50 个；新词不够时，用最久没做的词补足 |
| 错题本 | 答错自动加入；在错题本里**连续答对 2 次**自动移出 |
| 错题练习 | 只出错题本里的词（最多 50 个），有奖金，但没有全对奖励 |
| 奖金 | 答对 ¥10；连对每多一题再加 ¥2，最多加 ¥20（单题最高 ¥30）；答错不扣钱，连对清零 |
| 全对奖励 | 新一轮 50 题全对，额外 ¥100 |
| 中途退出 | 这一轮不计奖金，但已经做过的题和错题都会保存 |

奖金是**虚拟奖金**，只用来计分，不能提现。

## 常见改动

- **改奖金数额**：`app.js` 最上面的 `BASE`、`STEP`、`STEP_MAX`、`PERFECT`。如果把单题最高奖金改得超过 30 元，或全对奖改得超过 100 元，还要同步改 `schema.sql` 里 `finish_round` 函数的防呆检查（`p_total * 30 + 100`），然后重新运行 schema.sql。
- **改“连对几次移出错题本”**：`app.js` 里的 `MASTER`，同时把 `schema.sql` 的 `record_answer` 函数里的 `>= 2` 改成相同数字，重新运行。
- **改网站名字**：`config.js` 里的 `APP_NAME`。
- **加词**：在 `words.js` 数组末尾追加 `["单词","音标","词性","释义"]`。单词本身不要重复，学习记录是按单词本身保存的。已有的学习记录不受影响。
- **忘记密码**：Supabase 后台 **Authentication → Users**，找到这个用户，可以发送重置密码邮件，或者直接删除用户让他重新注册（删除后他的数据也会一起删掉）。

## 常见问题

**打开网址一直转圈 / 提示“加载失败”**
- 提示“数据库里还没有建表”：回第 1 步运行 `schema.sql`。
- 提示网络失败：检查 `config.js` 里的 URL 是否写对（要以 `https://` 开头、`.supabase.co` 结尾），再检查网络。

**登录页提示“还没有配置 Supabase”**
`config.js` 还是占位内容，或者改完后忘了重新上传到 GitHub。GitHub 上改文件后要等 1 分钟左右才生效，手机上可以强制刷新或换个浏览器。

**注册后收不到邮件**
回第 1 步，把 Confirm email 关掉。

**国内能不能用？**
github.io 和 supabase.co 在国内都可能时快时慢，有些网络会打不开，我这边没法替你保证。如果朋友们反馈打不开，可以把同样的文件部署到国内更稳的静态托管（Cloudflare Pages、Vercel、Gitee Pages、腾讯云 COS 等），Supabase 部分不用改。

**Supabase 免费项目会暂停**
免费项目连续 7 天没有任何活动会被暂停，数据不会丢，进后台点 Restore 即可恢复。

## 关于安全和“作弊”

- 数据隔离靠行级安全：每个人只能读写自己的数据，这部分是严格的。
- 但出题、判分、算奖金都是在浏览器里完成的，懂技术的人理论上可以伪造请求，给自己加奖金。`schema.sql` 里加了基本的数值上限检查，能挡住明显离谱的数字，但挡不住“伪造一轮正常范围内的成绩”。
- 因为奖金是虚拟的，朋友间玩玩没问题。如果以后要和真金白银挂钩，必须把出题和判分搬到服务端（Supabase Edge Function），让浏览器只负责显示。
