"use strict";
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'CHAT_DELETE_TOGGLE' });
    await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
    await chrome.action.setTitle({ tabId: tab.id, title: '대화 선택 켜기·끄기' });
  } catch {
    await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
    await chrome.action.setTitle({ tabId: tab.id, title: 'ChatGPT 탭을 새로고침한 뒤 사용하세요.' });
  }
});
