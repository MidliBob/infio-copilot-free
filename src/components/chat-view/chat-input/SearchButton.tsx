import { SearchIcon } from 'lucide-react'

import { t } from '../../../lang/helpers'

export function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="icf-chat-user-input-submit-button" onClick={onClick}>
      {t('chat.input.search')}
      <div className="icf-chat-user-input-submit-button-icons">
        <SearchIcon size={12} />
      </div>
    </button>
  )
}
