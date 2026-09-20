import { ImageUp } from 'lucide-react'
import { TFile } from 'obsidian'

import { useApp } from '../../../contexts/AppContext'
import { ImageSelectorModal } from '../../modals/ImageSelectorModal'

export function ImageUploadButton({
  onUpload,
}: {
  onUpload: (files: File[]) => void
}) {
  const app = useApp()

  const handleClick = () => {
    const handleVaultImages = async (files: TFile[]) => {
      const imageFiles = await Promise.all(
        files.map(async (file) => {
          const arrayBuffer = await app.vault.readBinary(file)
          const blob = new Blob([arrayBuffer], { type: `image/${file.extension}` })
          return new File([blob], file.name, { type: `image/${file.extension}` })
        })
      )
      onUpload(imageFiles)
    }

    new ImageSelectorModal(app, onUpload, handleVaultImages).open()
  }

  return (
    <button 
      className="icf-chat-user-input-submit-button"
      onClick={handleClick}
    >
      <div className="icf-chat-user-input-submit-button-icons">
				<ImageUp size={14} />
      </div>
      {/* <div>{t('chat.input.image')}</div> */}
    </button>
  )
}
