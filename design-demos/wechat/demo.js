const body = document.body

document.querySelectorAll('[data-mode-button]').forEach((button) => {
  button.addEventListener('click', () => {
    body.dataset.mode = button.dataset.modeButton
    document.querySelectorAll('[data-mode-button]').forEach((item) => item.classList.toggle('active', item === button))
  })
})

function selectPhoneView(view) {
  body.dataset.phoneView = view
  document.querySelectorAll('[data-view-button]').forEach((item) => item.classList.toggle('active', item.dataset.viewButton === view))
}

document.querySelectorAll('[data-view-button]').forEach((button) => button.addEventListener('click', () => selectPhoneView(button.dataset.viewButton)))
document.querySelector('[data-open-chat]').addEventListener('click', () => selectPhoneView('chat'))
document.querySelector('[data-back-messages]').addEventListener('click', () => selectPhoneView('messages'))

const template = document.querySelector('#conversation-template')
document.querySelectorAll('Conversation').forEach((source) => {
  const node = template.content.firstElementChild.cloneNode(true)
  node.classList.toggle('active', source.hasAttribute('active'))
  const avatar = node.querySelector('.avatar')
  avatar.textContent = source.getAttribute('avatar')
  avatar.classList.add(`avatar-${source.getAttribute('tone')}`)
  node.querySelector('b').textContent = source.getAttribute('name')
  node.querySelector('time').textContent = source.getAttribute('time')
  node.querySelector('p').textContent = source.getAttribute('preview')
  const badge = node.querySelector('em')
  const badgeValue = source.getAttribute('badge')
  if (badgeValue) badge.textContent = badgeValue
  else badge.remove()
  source.replaceWith(node)
})
