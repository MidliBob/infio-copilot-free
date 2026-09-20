import { App, Modal, TFile } from 'obsidian'
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { t } from '../../lang/helpers'

type ImageSelectorProps = {
  onClose: () => void
  onSelectImages: (files: File[]) => void
  onSelectVaultImages: (files: TFile[]) => void
  app: App
}

const ImageSelector: React.FC<ImageSelectorProps> = ({
  onClose,
  onSelectImages,
  onSelectVaultImages,
  app,
}) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [vaultImages, setVaultImages] = useState<TFile[]>([])

  useEffect(() => {
    const images = app.vault.getFiles()
      .filter((file) => file.extension.match(/png|jpg|jpeg|gif|svg/i))
      .filter((file) =>
        searchTerm ? file.path.toLowerCase().includes(searchTerm.toLowerCase()) : true
      )
    setVaultImages(images)
  }, [searchTerm, app.vault])

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (files.length > 0) {
      onSelectImages(files)
      onClose()
    }
  }

  return (
    <div className="icf-image-selector">
      <div className="icf-image-selector-header">
        <input
          type="text"
          placeholder="Search images in vault..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="icf-image-search"
        />
        <label className="icf-upload-button">
          {t('chat.input.uploadNewImage')}
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      <div className="icf-image-grid">
        {vaultImages.map((file) => (
          <div
            key={file.path}
            className="icf-image-item"
            onClick={() => {
              onSelectVaultImages([file])
              onClose()
            }}
          >
            <img
              src={app.vault.adapter.getResourcePath(file.path)}
              alt={file.name}
            />
            <div className="icf-image-name">{file.name}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export class ImageSelectorModal extends Modal {
  private readonly onSelectImages: (files: File[]) => void
  private readonly onSelectVaultImages: (files: TFile[]) => void

  constructor(
    app: App,
    onSelectImages: (files: File[]) => void,
    onSelectVaultImages: (files: TFile[]) => void,
  ) {
    super(app)
    this.onSelectImages = onSelectImages
    this.onSelectVaultImages = onSelectVaultImages
  }

  onOpen(): void {
    const { contentEl, modalEl } = this

    // 添加特定的CSS类以便我们可以定位模态框
    modalEl.addClass('mod-image-selector')

    const root = createRoot(contentEl)

    root.render(
      <ImageSelector
        onClose={() => this.close()}
        onSelectImages={this.onSelectImages}
        onSelectVaultImages={this.onSelectVaultImages}
        app={this.app}
      />
    )
  }

  onClose(): void {
    const { contentEl, modalEl } = this
    // 移除特定的CSS类
    modalEl.removeClass('mod-image-selector')
    contentEl.empty()
  }
}
