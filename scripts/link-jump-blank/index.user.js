// ==UserScript==
// @name         在新标签页打开链接（可取消）Open all links in new tab
// @namespace    http://tampermonkey.net/
// @version      0.0.6
// @description  强制在新标签页打开链接， 点击当前脚本可以disable取消强制效果，再次点击可重启强制效果 Force all links to open in a new tab with domain-specific toggle
// @author       AvailableForTheWorld
// @match        *://*/*
// @icon         https://www.svgrepo.com/show/207466/blank-page-list.svg
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @downloadURL  https://github.com/AvailableForTheWorld/Tampermonkey/raw/refs/heads/master/scripts/link-jump-blank/index.user.js
// @updateURL    https://github.com/AvailableForTheWorld/Tampermonkey/raw/refs/heads/master/scripts/link-jump-blank/index.user.js
// ==/UserScript==

(function () {
    'use strict';

    const currentDomain = window.location.hostname;
    const disabledDomains = GM_getValue('disabledDomains', {});
    const isDisabled = disabledDomains[currentDomain];

    // 始终注册菜单命令
    registerMenuCommands();

    // 仅当在此域名未禁用时，才执行修改链接的逻辑
    if (!isDisabled) {
        processLinks();
        setupMutationObserver();
    }

    function registerMenuCommands() {
        const disabledDomains = GM_getValue('disabledDomains', {});
        const isDisabled = disabledDomains[currentDomain];

        // 先尝试取消可能存在的旧菜单（如果Tampermonkey API支持的话，但通常不需要）
        // 菜单命令的名称是唯一的，重复注册通常会产生多个菜单项。

        if (isDisabled) {
            GM_registerMenuCommand(`✅ 在此网站启用“新标签页打开”`, enableScriptOnSite);
        } else {
            GM_registerMenuCommand(`❌ 在此网站禁用“新标签页打开”`, disableScriptOnSite);
        }

        GM_registerMenuCommand('📋 管理所有已禁用的网站', showDomainManager);
    }

    function enableScriptOnSite() {
        toggleCurrentDomain(false);
        showReloadNotification("功能已启用！");
    }

    function disableScriptOnSite() {
        toggleCurrentDomain(true);
        showReloadNotification("功能已禁用！");
    }

    function toggleCurrentDomain(disable) {
        const disabledDomains = GM_getValue('disabledDomains', {});
        if (disable) {
            disabledDomains[currentDomain] = true;
        } else {
            delete disabledDomains[currentDomain];
        }
        GM_setValue('disabledDomains', disabledDomains);
    }

    function showReloadNotification(message) {
        // 提供一个更友好的提示，建议用户刷新
        if (confirm(`${message} 需要刷新页面才能生效。立即刷新？`)) {
            window.location.reload();
        }
    }

    function processLinks() {
        const links = document.getElementsByTagName('a');
        for (let i = 0; i < links.length; i++) {
            // 避免修改已经设置了的target属性
            if (!links[i].target || links[i].target === '_self') {
                links[i].target = '_blank';
            }
        }
    }

    function setupMutationObserver() {
        const observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(function (node) {
                    if (node.nodeType === 1) { // Element node
                        if (node.tagName === 'A') {
                            if (!node.target || node.target === '_self') {
                                node.target = '_blank';
                            }
                        } else if (node.querySelectorAll) {
                            const newLinks = node.querySelectorAll('a');
                            newLinks.forEach(function (link) {
                                if (!link.target || link.target === '_self') {
                                    link.target = '_blank';
                                }
                            });
                        }
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function showDomainManager() {
        const disabledDomains = GM_getValue('disabledDomains', {});
        const domains = Object.keys(disabledDomains);

        if (domains.length === 0) {
            alert('当前没有禁用的域名');
            return;
        }

        let message = '已禁用的域名:\n\n';
        domains.forEach(domain => {
            message += `• ${domain}\n`;
        });
        message += '\n要启用某个域名，请访问该网站并使用菜单中的启用选项。';

        alert(message);
    }

})();