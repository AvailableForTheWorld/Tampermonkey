// ==UserScript==
// @name         在新标签页打开链接（可取消）Open all links in new tab
// @namespace    http://tampermonkey.net/
// @version      0.0.8
// @description  强制在新标签页打开链接， 点击当前脚本可以disable取消强制效果，再次点击可重启强制效果 Force all links to open in a new tab with domain-specific toggle
// @author       AvailableForTheWorld
// @match        *://*/*
// @icon         https://www.svgrepo.com/show/207466/blank-page-list.svg
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_openInTab
// @downloadURL  https://github.com/AvailableForTheWorld/Tampermonkey/raw/refs/heads/master/scripts/link-jump-blank/index.user.js
// @updateURL    https://github.com/AvailableForTheWorld/Tampermonkey/raw/refs/heads/master/scripts/link-jump-blank/index.user.js
// ==/UserScript==

;(function () {
  'use strict'

  // 检查是否由本脚本打开，如果是则不再处理
  if (sessionStorage.getItem('openedByScript') === 'true') {
    sessionStorage.removeItem('openedByScript') // 清理标记
    return // 退出脚本执行
  }

  const currentDomain = window.location.hostname
  const disabledDomains = GM_getValue('disabledDomains', {})
  const isDisabled = disabledDomains[currentDomain]

  // --- 防止重复打开的逻辑 START ---
  let lastOpenTime = 0
  let lastOpenUrl = ''
  let lastTriggerTime = 0 // 记录上一次触发新标签页打开的时间（包括原生 _blank 点击）

  function safeOpenInTab(url, options) {
    const now = Date.now()
    // 如果在短时间内对同一个 URL 重复请求，则忽略
    if (now - lastOpenTime < 2000 && url === lastOpenUrl) {
      console.log('拦截到重复打开请求:', url)
      return
    }
    lastOpenTime = now
    lastOpenUrl = url
    GM_openInTab(url, options)
  }

  // 全局监听点击事件，捕获 _blank 链接的点击
  document.addEventListener(
    'click',
    function (e) {
      let target = e.target
      // 向上查找 A 标签
      while (target && target.tagName !== 'A') {
        target = target.parentNode
      }
      if (target && target.tagName === 'A') {
        // 如果链接的 target 是 _blank（包括我们修改的），说明浏览器会处理打开新窗口
        // 此时我们记录时间，以便后续的 pushState/hashchange 忽略此次导航引起的路由变化
        if (target.target === '_blank') {
          lastTriggerTime = Date.now()
          lastOpenTime = Date.now() // 同时更新 lastOpenTime，视为已打开
          lastOpenUrl = target.href // 记录 URL
          console.log('检测到点击 _blank 链接，标记 lastTriggerTime')
        }
      }
    },
    true
  ) // 使用捕获阶段
  // --- 防止重复打开的逻辑 END ---

  // 保存原生的 history.pushState 和 history.replaceState 方法
  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState

  // 重写 history.pushState
  history.pushState = function (state, title, url) {
    if (isDisabled) return originalPushState.apply(this, arguments)

    console.log('检测到 pushState 路由变化，新路由:', url)
    handleRoutingChange(url) // 处理路由变化
    // 我们允许原页面继续执行 pushState，以避免破坏 SPA 的内部状态
    // 这意味着原页面也会导航到新 URL，同时新标签页也会打开
    return originalPushState.apply(this, arguments)
  }

  // 重写 history.replaceState
  history.replaceState = function (state, title, url) {
    if (isDisabled) return originalReplaceState.apply(this, arguments)

    console.log('检测到 replaceState 路由变化，新路由:', url)
    // handleRoutingChange(url) // Bilibili 等网站会在点击后立即调用 replaceState 更新 URL，导致重复打开。通常 replaceState 不应视为新页面跳转。
    // 同样允许原页面执行 replaceState
    return originalReplaceState.apply(this, arguments)
  }

  // 监听 popstate 事件（例如用户前进后退）
  window.addEventListener('popstate', function (event) {
    // 注意：popstate 事件触发时，URL 已经改变了
    console.log('检测到 popstate 路由变化，新URL:', window.location.href)
    // 对于 popstate，我们通常不阻止，因为这是用户主动的导航行为
    // 但你仍然可以在这里进行新窗口打开操作
    // handleRoutingChange(window.location.href);
  })

  // 处理路由变化的函数
  function handleRoutingChange(newUrl) {
    // 如果 newUrl 不存在或不是字符串，可能是仅修改 state 而不修改 URL，或者参数为空
    if (!newUrl || typeof newUrl !== 'string') {
      return
    }

    // 如果最近刚刚触发了打开新窗口（例如用户点击了链接），则忽略此次路由变化
    if (Date.now() - lastTriggerTime < 2000) {
      console.log('检测到刚触发过打开操作，忽略本次路由变化')
      return
    }

    // 确保 newUrl 是完整的 URL
    let fullNewUrl = newUrl
    if (!newUrl.startsWith('http')) {
      // 如果 newUrl 是相对路径，则构建完整的 URL
      fullNewUrl = new URL(newUrl, window.location.origin).href
    }

    // 检查是否是当前页面，避免重复打开相同页面
    if (fullNewUrl === window.location.href) {
      return
    }

    // 设置标记，表明新页面由脚本打开
    sessionStorage.setItem('openedByScript', 'true')

    // 使用油猴的 GM_openInTab 在新标签页打开，false 表示不立即聚焦
    safeOpenInTab(fullNewUrl, false)
    console.log('已在新标签页打开:', fullNewUrl)
  }

  // 如果你的脚本只在特定页面运行，且想监听哈希路由变化，可以添加：
  window.addEventListener('hashchange', function (event) {
    console.log('检测到 hashchange，新URL:', event.newURL)
    // 对于哈希路由，我们通常也不阻止默认行为
    handleRoutingChange(event.newURL)
  })

  // 始终注册菜单命令
  registerMenuCommands()

  // 仅当在此域名未禁用时，才执行修改链接的逻辑
  if (!isDisabled) {
    processLinks()
    setupMutationObserver()
    overrideWindowOpen() // 新增：重写window.open
  }

  function overrideWindowOpen() {
    // 保存页面原本的window.open方法
    const originalWindowOpen = unsafeWindow.window.open

    // 重写unsafeWindow的window.open方法
    unsafeWindow.window.open = function (url, windowName, windowFeatures) {
      // 尝试使用GM_openInTab在新标签页打开
      // 注意：GM_openInTab要求url是字符串，所以需要检查
      if (typeof url === 'string') {
        // 添加同样的防护逻辑
        if (url === window.location.href) {
          return null
        }
        sessionStorage.setItem('openedByScript', 'true')

        lastTriggerTime = Date.now()

        // 这里我们选择在新标签页打开，但不立即激活（第二个参数为false）
        // 如果你希望新标签页获得焦点，可以设为true
        safeOpenInTab(url, false)
        // 因为使用了GM_openInTab，我们可以返回一个模拟的window对象，或者直接返回null
        // 但有些页面可能会检查返回值，这里我们返回一个代理对象或直接调用原方法，根据需求调整
        // 为了兼容性，也可以选择调用原生的window.open，但强制其在新标签页打开
        // 示例选择返回null，因为GM_openInTab没有返回值
        return null
      } else {
        // 如果url不是字符串，可能不是我们想处理的，调用原始方法
        // 但通常window.open的第一个参数就是url字符串
        return originalWindowOpen.apply(this, arguments)
      }
    }
  }

  function registerMenuCommands() {
    const disabledDomains = GM_getValue('disabledDomains', {})
    const isDisabled = disabledDomains[currentDomain]

    // 先尝试取消可能存在的旧菜单（如果Tampermonkey API支持的话，但通常不需要）
    // 菜单命令的名称是唯一的，重复注册通常会产生多个菜单项。

    if (isDisabled) {
      GM_registerMenuCommand(
        `✅ 在此网站启用“新标签页打开”`,
        enableScriptOnSite
      )
    } else {
      GM_registerMenuCommand(
        `❌ 在此网站禁用“新标签页打开”`,
        disableScriptOnSite
      )
    }

    GM_registerMenuCommand('📋 管理所有已禁用的网站', showDomainManager)
  }

  function enableScriptOnSite() {
    toggleCurrentDomain(false)
    showReloadNotification('功能已启用！')
  }

  function disableScriptOnSite() {
    toggleCurrentDomain(true)
    showReloadNotification('功能已禁用！')
  }

  function toggleCurrentDomain(disable) {
    const disabledDomains = GM_getValue('disabledDomains', {})
    if (disable) {
      disabledDomains[currentDomain] = true
    } else {
      delete disabledDomains[currentDomain]
    }
    GM_setValue('disabledDomains', disabledDomains)
  }

  function showReloadNotification(message) {
    // 提供一个更友好的提示，建议用户刷新
    if (confirm(`${message} 需要刷新页面才能生效。立即刷新？`)) {
      window.location.reload()
    }
  }

  function processLinks() {
    const links = document.getElementsByTagName('a')
    for (let i = 0; i < links.length; i++) {
      // 避免修改已经设置了的target属性
      if (!links[i].target || links[i].target === '_self') {
        links[i].target = '_blank'
      }
    }
  }

  function setupMutationObserver() {
    const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === 1) {
            // Element node
            if (node.tagName === 'A') {
              if (!node.target || node.target === '_self') {
                node.target = '_blank'
              }
            } else if (node.querySelectorAll) {
              const newLinks = node.querySelectorAll('a')
              newLinks.forEach(function (link) {
                if (!link.target || link.target === '_self') {
                  link.target = '_blank'
                }
              })
            }
          }
        })
      })
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })
  }

  function showDomainManager() {
    const disabledDomains = GM_getValue('disabledDomains', {})
    const domains = Object.keys(disabledDomains)

    if (domains.length === 0) {
      alert('当前没有禁用的域名')
      return
    }

    let message = '已禁用的域名:\n\n'
    domains.forEach((domain) => {
      message += `• ${domain}\n`
    })
    message += '\n要启用某个域名，请访问该网站并使用菜单中的启用选项。'

    alert(message)
  }
})()
