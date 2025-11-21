// ==UserScript==
// @name         在新标签页打开链接（可取消 + 聚焦新页）
// @namespace    http://tampermonkey.net/
// @version      0.0.10
// @description  强制所有链接和 SPA 路由在新标签页打开并立即聚焦，新页面获得焦点，当前页保持不动。支持按域名禁用。
// @author       AvailableForTheWorld + Grok
// @match        *://*/*
// @icon         https://www.svgrepo.com/show/207466/blank-page-list.svg
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @downloadURL  https://github.com/AvailableForTheWorld/Tampermonkey/raw/refs/heads/master/scripts/link-jump-blank/index.user.js
// @updateURL    https://github.com/AvailableForTheWorld/Tampermonkey/raw/refs/heads/master/scripts/link-jump-blank/index.user.js
// ==/UserScript==

;(function () {
  'use strict'

  // 如果是由本脚本打开的新标签页，直接退出，避免干扰
  if (sessionStorage.getItem('openedByScript') === 'true') {
    sessionStorage.removeItem('openedByScript')
    return
  }

  const currentDomain = window.location.hostname
  const disabledDomains = GM_getValue('disabledDomains', {})
  const isDisabled = !!disabledDomains[currentDomain]

  // === 防重复打开逻辑 ===
  let lastOpenTime = 0
  let lastOpenUrl = ''
  let lastTriggerTime = 0

  function safeOpenInTab(url, options = {}) {
    const now = Date.now()
    if (now - lastOpenTime < 2000 && url === lastOpenUrl) {
      console.log('【新标签页脚本】拦截重复打开:', url)
      return
    }
    lastOpenTime = now
    lastOpenUrl = url

    // 默认立即聚焦新标签页
    const finalOptions = { active: true, ...options }
    GM_openInTab(url, finalOptions)
  }

  // === 注册菜单 ===
  function registerMenuCommands() {
    const isDisabledNow = !!GM_getValue('disabledDomains', {})[currentDomain]
    if (isDisabledNow) {
      GM_registerMenuCommand(`✅ 在此网站启用“新标签页打开”`, () =>
        toggleCurrentDomain(false)
      )
    } else {
      GM_registerMenuCommand(`❌ 在此网站禁用“新标签页打开”`, () =>
        toggleCurrentDomain(true)
      )
    }
    GM_registerMenuCommand('📋 查看已禁用的网站', showDomainManager)
  }

  function toggleCurrentDomain(disable) {
    const obj = GM_getValue('disabledDomains', {})
    if (disable) obj[currentDomain] = true
    else delete obj[currentDomain]
    GM_setValue('disabledDomains', obj)
    if (
      confirm(`${disable ? '已禁用' : '已启用'}，需要刷新页面生效。现在刷新？`)
    ) {
      location.reload()
    }
  }

  function showDomainManager() {
    const list = Object.keys(GM_getValue('disabledDomains', {}))
    if (list.length === 0) return alert('没有禁用的网站')
    alert(
      '已禁用的网站：\n\n• ' +
        list.join('\n• ') +
        '\n\n访问对应网站后可重新启用。'
    )
  }

  registerMenuCommands()

  // 如果当前域名被禁用，直接结束
  if (isDisabled) return

  // === 1. 全局点击拦截（确保只有一份页面实例）===
  // 使用捕获阶段拦截所有点击，防止原页面跳转（通过 stopPropagation）
  window.addEventListener(
    'click',
    (e) => {
      // 1. 如果按下了修饰键（Ctrl/Meta/Shift/Alt），由浏览器默认处理（通常是后台打开或新窗口）
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
      // 2. 仅处理鼠标左键
      if (e.button !== 0) return

      let target = e.target
      while (target && target.tagName !== 'A') {
        target = target.parentNode
      }

      if (!target || !target.href) return

      // 忽略非 HTTP 协议链接 (javascript:, tel:, mailto: 等)
      if (!target.href.startsWith('http')) return

      // 检查是否为本页锚点跳转
      try {
        const urlObj = new URL(target.href)
        if (
          urlObj.origin === location.origin &&
          urlObj.pathname === location.pathname &&
          urlObj.search === location.search
        ) {
          return // 仅哈希变化或相同页面，允许默认行为
        }
      } catch (err) {
        return
      }

      // === 拦截逻辑 ===
      // 阻止默认行为（防止原页面跳转）和冒泡（防止网站 SPA 路由接管）
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()

      const url = target.href

      // 记录触发时间，通知 pushState/replaceState 忽略
      lastTriggerTime = Date.now()
      sessionStorage.setItem('openedByScript', 'true')

      console.log('【新标签页脚本】拦截点击 → 新标签页打开:', url)
      safeOpenInTab(url, { active: true })
    },
    true // Capture phase
  )

  // === 2. 辅助功能：给链接添加 _blank 样式（视觉提示）===
  // 虽然点击被拦截了，但保留这个为了让用户 hover 时看到 cursor 变化或浏览器提示
  function setTargetBlank(node) {
    if (node.tagName === 'A' && (!node.target || node.target === '_self')) {
      node.target = '_blank'
      node.rel = 'noopener noreferrer'
    }
  }

  function processLinks() {
    document.querySelectorAll('a').forEach(setTargetBlank)
  }

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return
        setTargetBlank(node)
        if (node.querySelectorAll)
          node.querySelectorAll('a').forEach(setTargetBlank)
      })
    })
  })
  observer.observe(document.body, { childList: true, subtree: true })
  processLinks()

  // === 3. 拦截 SPA 路由（pushState / hashchange）===
  const origPushState = history.pushState
  const origReplaceState = history.replaceState

  history.pushState = function (state, title, url) {
    if (!url || typeof url !== 'string')
      return origPushState.apply(this, arguments)

    let fullUrl = url
    try {
      fullUrl = new URL(url, location.href).href
    } catch {}

    if (fullUrl === location.href) return origPushState.apply(this, arguments)

    // 如果最近刚点击过链接（被 click 拦截处理了），则忽略此次 pushState
    if (Date.now() - lastTriggerTime < 2000) return

    lastTriggerTime = Date.now()
    sessionStorage.setItem('openedByScript', 'true')
    setTimeout(() => safeOpenInTab(fullUrl, { active: true }), 50)

    console.log('【新标签页脚本】拦截 pushState → 新标签页打开:', fullUrl)
    // 不调用 origPushState
  }

  history.replaceState = function (state, title, url) {
    lastTriggerTime = Date.now()
    lastOpenTime = Date.now()
    if (typeof url === 'string') lastOpenUrl = url
    return origReplaceState.apply(this, arguments)
  }

  window.addEventListener('hashchange', (e) => {
    if (Date.now() - lastTriggerTime < 2000) return
    lastTriggerTime = Date.now()
    sessionStorage.setItem('openedByScript', 'true')
    setTimeout(() => safeOpenInTab(e.newURL, { active: true }), 50)
    console.log('【新标签页脚本】hashchange → 新标签页打开:', e.newURL)
  })

  // === 4. 拦截 window.open ===
  const origOpen = window.open
  window.open = function (url, name, features) {
    if (typeof url === 'string' && url) {
      let fullUrl = url
      try {
        fullUrl = new URL(url, location.href).href
      } catch {}
      if (fullUrl !== location.href) {
        sessionStorage.setItem('openedByScript', 'true')
        safeOpenInTab(fullUrl, { active: true })
        return null
      }
    }
    return origOpen.apply(this, arguments)
  }

  console.log(
    '【新标签页强制脚本】已激活（聚焦新页模式） - 当前域名:',
    currentDomain
  )
})()
