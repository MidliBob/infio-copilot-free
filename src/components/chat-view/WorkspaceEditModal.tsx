import { ChevronDown, FolderOpen, Plus, Tag, Trash2, X } from 'lucide-react'
import { App, TFolder } from 'obsidian'
import { useEffect, useRef, useState } from 'react'

import { Workspace, WorkspaceContent } from '../../database/json/workspace/types'
import { t } from '../../lang/helpers'
import { logger } from '../../utils/logger'

interface WorkspaceEditModalProps {
  workspace?: Workspace
  app: App
  isOpen: boolean
  onClose: () => void
  onSave: (updatedWorkspace: Partial<Workspace>) => Promise<void>
}

const WorkspaceEditModal = ({ 
  workspace, 
  app, 
  isOpen, 
  onClose, 
  onSave 
}: WorkspaceEditModalProps) => {
  // 生成默认工作区名称
  const getDefaultWorkspaceName = (): string => {
    const now = new Date()
    const date = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`
    return String(t('workspace.editModal.defaultName', { date }))
  }
  
  const [name, setName] = useState(workspace?.name || getDefaultWorkspaceName())
  const [content, setContent] = useState<WorkspaceContent[]>(workspace?.content ? [...workspace.content] : [])
  const [availableFolders, setAvailableFolders] = useState<string[]>([])
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  
  // 智能添加相关状态
  const [inputValue, setInputValue] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [filteredSuggestions, setFilteredSuggestions] = useState<{type: 'folder' | 'tag', value: string}[]>([])
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // 获取可用的文件夹和标签
  useEffect(() => {
    if (!isOpen) return

    const loadAvailableOptions = async () => {
      // 获取所有文件夹
      const folders: string[] = []
      const addFolder = (folder: TFolder) => {
        folders.push(folder.path)
      }

			app.vault.getAllFolders(false).forEach(folder => {
				addFolder(folder)
      })

      setAvailableFolders(folders.sort())

      // 直接使用 Obsidian 的内置接口获取所有标签
			try {
				// @ts-ignore
				const tagsObject = app.metadataCache.getTags() as Record<string, number> // 获取所有标签 {'#tag1': 2, '#tag2': 4}
        const tags = Object.keys(tagsObject).sort()
        setAvailableTags(tags)
      } catch (error) {
        logger.error('获取标签失败:', error)
        setAvailableTags([])
      }
    }

    void loadAvailableOptions()
  }, [isOpen, app])

  // 重置表单
  useEffect(() => {
    if (isOpen) {
      setName(workspace?.name || getDefaultWorkspaceName())
      setContent(workspace?.content ? [...workspace.content] : [])
    }
  }, [isOpen, workspace])

  // 更新建议列表
  useEffect(() => {
    if (!inputValue.trim()) {
      setFilteredSuggestions([])
      setShowSuggestions(false)
      return
    }

    const suggestions: {type: 'folder' | 'tag', value: string}[] = []
    const searchTerm = inputValue.toLowerCase()

    // 搜索匹配的文件夹
    availableFolders.forEach(folder => {
      if (folder.toLowerCase().includes(searchTerm)) {
        // 检查是否已存在
        const exists = content.some(item => 
          item.type === 'folder' && item.content === folder
        )
        if (!exists) {
          suggestions.push({ type: 'folder', value: folder })
        }
      }
    })

		// 搜索匹配的标签
    availableTags.forEach(tag => {
      // 改善搜索匹配逻辑，支持中文和更灵活的匹配
      const tagForSearch = tag.toLowerCase()
      const shouldMatch = searchTerm.startsWith('#') 
        ? tagForSearch.includes(searchTerm.toLowerCase()) // 如果搜索词以#开头，直接匹配
        : tagForSearch.includes(searchTerm) || tagForSearch.includes(`#${searchTerm}`) // 否则同时匹配带#和不带#的情况
      
      if (shouldMatch) {
        // 检查是否已存在
        const exists = content.some(item => 
          item.type === 'tag' && item.content === tag
        )
        if (!exists) {
          suggestions.push({ type: 'tag', value: tag })
        }
      }
    })

    // 如果输入以#开头，优先显示标签建议
    if (inputValue.startsWith('#')) {
      suggestions.sort((a, b) => {
        if (a.type === 'tag' && b.type !== 'tag') return -1
        if (a.type !== 'tag' && b.type === 'tag') return 1
        return 0
      })
    } else {
      // 否则优先显示文件夹建议
      suggestions.sort((a, b) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1
        if (a.type !== 'folder' && b.type === 'folder') return 1
        return 0
      })
    }

    setFilteredSuggestions(suggestions.slice(0, 20)) // 限制显示数量
    setShowSuggestions(suggestions.length > 0)
    setSelectedSuggestionIndex(-1)
  }, [inputValue, availableFolders, availableTags, content])

  // 添加内容项
  const addContentItem = (type: 'folder' | 'tag', contentValue: string) => {
    if (!contentValue.trim()) return
    
    // 检查是否已存在
    const exists = content.some(item => 
      item.type === type && item.content === contentValue
    )
    
    if (exists) return

    const newItem: WorkspaceContent = {
      type,
      content: contentValue
    }
    
    setContent([...content, newItem])
    
    // 清空输入框和建议
    setInputValue('')
    setShowSuggestions(false)
    setSelectedSuggestionIndex(-1)
  }

  // 处理建议选择
  const handleSuggestionSelect = (suggestion: {type: 'folder' | 'tag', value: string}) => {
    addContentItem(suggestion.type, suggestion.value)
  }

  // 处理手动添加
  const handleManualAdd = () => {
    const value = inputValue.trim()
    if (!value) return

    // 自动判断类型
    const type = value.startsWith('#') ? 'tag' : 'folder'
    addContentItem(type, value)
  }

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) {
      if (e.key === 'Enter') {
        handleManualAdd()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedSuggestionIndex(prev => 
          prev < filteredSuggestions.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1)
        break
      case 'Enter':
        e.preventDefault()
        if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < filteredSuggestions.length) {
          handleSuggestionSelect(filteredSuggestions[selectedSuggestionIndex])
        } else {
          handleManualAdd()
        }
        break
      case 'Escape':
        setShowSuggestions(false)
        setSelectedSuggestionIndex(-1)
        break
    }
  }

  // 点击外部关闭建议
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target
      if (
        target instanceof Node &&
        inputRef.current && 
        !inputRef.current.contains(target) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(target)
      ) {
        setShowSuggestions(false)
        setSelectedSuggestionIndex(-1)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 删除内容项
  const removeContentItem = (index: number) => {
    setContent(content.filter((_, i) => i !== index))
  }

  // 保存更改
  const handleSave = async () => {
    if (!name.trim()) {
      alert(t('workspace.editModal.nameRequired'))
      return
    }

    setIsLoading(true)
    try {
      await onSave({
        name: name.trim(),
        content
      })
      onClose()
    } catch (error) {
      logger.error('保存工作区失败:', error)
      alert(t('workspace.editModal.saveFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="workspace-edit-modal-overlay">
      <div className="workspace-edit-modal">
        {/* 头部 */}
        <div className="workspace-edit-modal-header">
          <h3>{workspace ? t('workspace.editModal.editTitle') : t('workspace.editModal.createTitle')}</h3>
          <button 
            className="workspace-edit-modal-close"
            onClick={onClose}
            disabled={isLoading}
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容 */}
        <div className="workspace-edit-modal-content">
          {/* 工作区名称 */}
          <div className="workspace-edit-section">
            <label className="workspace-edit-label">{t('workspace.editModal.nameLabel')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="workspace-edit-input"
              placeholder={workspace ? t('workspace.editModal.namePlaceholder') : t('workspace.editModal.newNamePlaceholder')}
              disabled={isLoading}
            />
          </div>

          {/* 工作区内容 */}
          <div className="workspace-edit-section">
            <label className="workspace-edit-label">{t('workspace.editModal.contentLabel')}</label>
            
            {/* 当前内容列表 */}
            <div className="workspace-content-list">
              {content.map((item, index) => (
                <div key={index} className="workspace-content-item">
                  <div className="workspace-content-item-info">
                    {item.type === 'folder' ? (
                      <FolderOpen size={16} />
                    ) : (
                      <Tag size={16} />
                    )}
                    <span className="workspace-content-item-text">
                      {item.content}
                    </span>
                    <span className="workspace-content-item-type">
                      ({item.type === 'folder' ? t('workspace.editModal.folder') : t('workspace.editModal.tag')})
                    </span>
                  </div>
                  <button
                    className="workspace-content-item-remove"
                    onClick={() => removeContentItem(index)}
                    disabled={isLoading}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              
              {content.length === 0 && (
                <div className="workspace-content-empty">
                  {t('workspace.editModal.noContent')}
                </div>
              )}
            </div>

            {/* 智能添加 - 作为内容列表的一部分 */}
            <div className="workspace-smart-add-item">
              <div className="workspace-smart-add-container">
                <div className={`workspace-smart-input-wrapper ${showSuggestions ? 'has-suggestions' : ''}`}>
                  <Plus size={16} className="workspace-smart-add-icon" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                      if (filteredSuggestions.length > 0) {
                        setShowSuggestions(true)
                      }
                    }}
                    placeholder={t('workspace.editModal.addPlaceholder')}
                    className="workspace-smart-input"
                    disabled={isLoading}
                  />
                  {showSuggestions && (
                    <ChevronDown 
                      size={16} 
                      className="workspace-smart-dropdown-icon workspace-smart-dropdown-icon-up"
                    />
                  )}
                </div>
                
                {/* 建议下拉列表 */}
                {showSuggestions && filteredSuggestions.length > 0 && (
                  <div ref={suggestionsRef} className="workspace-suggestions">
                    {filteredSuggestions.map((suggestion, index) => (
                      <div
                        key={`${suggestion.type}-${suggestion.value}`}
                        className={`workspace-suggestion-item ${
                          index === selectedSuggestionIndex ? 'selected' : ''
                        }`}
                        onClick={() => handleSuggestionSelect(suggestion)}
                        onMouseEnter={() => setSelectedSuggestionIndex(index)}
                      >
                        <div className="workspace-suggestion-content">
                          {suggestion.type === 'folder' ? (
                            <FolderOpen size={14} />
                          ) : (
                            <Tag size={14} />
                          )}
                          <span className="workspace-suggestion-text">
                            {suggestion.value}
                          </span>
                          <span className="workspace-suggestion-type">
                            {suggestion.type === 'folder' ? t('workspace.editModal.folder') : t('workspace.editModal.tag')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="workspace-smart-add-tip">
              {t('workspace.editModal.tip')}
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="workspace-edit-modal-footer">
          <button
            className="workspace-edit-btn workspace-edit-btn-cancel"
            onClick={onClose}
            disabled={isLoading}
          >
            {t('workspace.editModal.cancel')}
          </button>
          <button
            className="workspace-edit-btn workspace-edit-btn-save"
            onClick={handleSave}
            disabled={isLoading}
          >
            {isLoading 
              ? (workspace ? t('workspace.editModal.saving') : t('workspace.editModal.creating')) 
              : (workspace ? t('workspace.editModal.save') : t('workspace.editModal.create'))
            }
          </button>
        </div>
      </div>

      {/* 样式 */}
      <style>
        {`
        .workspace-edit-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .workspace-edit-modal {
          background-color: var(--background-primary);
          border: 1px solid var(--background-modifier-border);
          border-radius: var(--radius-m);
          width: 90%;
          max-width: 600px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        }

        .workspace-edit-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid var(--background-modifier-border);
        }

        .workspace-edit-modal-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .workspace-edit-modal-close {
          background: none;
          border: none;
          padding: 4px;
          border-radius: 4px;
          cursor: pointer;
          color: var(--text-muted);
          transition: all 0.2s ease;
        }

        .workspace-edit-modal-close:hover:not(:disabled) {
          background-color: var(--background-modifier-hover);
          color: var(--text-normal);
        }

        .workspace-edit-modal-close:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .workspace-edit-modal-content {
          flex: 1;
          padding: 20px;
          overflow-y: auto;
          scrollbar-width: thin;
        }

        .workspace-edit-section {
          margin-bottom: 24px;
        }

        .workspace-edit-label {
          display: block;
          font-weight: 500;
          margin-bottom: 8px;
          color: var(--text-normal);
        }

        .workspace-edit-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid var(--background-modifier-border);
          border-radius: var(--radius-s);
          background-color: var(--background-primary);
          color: var(--text-normal);
          font-size: 14px;
        }

        .workspace-edit-input:focus {
          outline: none;
          border-color: var(--text-accent);
        }

        .workspace-edit-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .workspace-content-list {
          border: 1px solid var(--background-modifier-border);
          border-radius: var(--radius-s);
          margin-bottom: 2px;
          max-height: 200px;
          overflow-y: auto;
          scrollbar-width: thin;
        }

        .workspace-content-list::-webkit-scrollbar {
          width: 6px;
        }

        .workspace-content-list::-webkit-scrollbar-track {
          background: transparent;
        }

        .workspace-content-list::-webkit-scrollbar-thumb {
          background-color: var(--background-modifier-border);
          border-radius: 3px;
        }

        .workspace-content-list::-webkit-scrollbar-thumb:hover {
          background-color: var(--background-modifier-border-hover);
        }

        .workspace-content-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          border-bottom: 1px solid var(--background-modifier-border);
        }

        .workspace-content-item:last-child {
          border-bottom: none;
        }

        .workspace-content-item-info {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
        }

        .workspace-content-item-text {
          font-weight: 500;
        }

        .workspace-content-item-type {
          color: var(--text-muted);
          font-size: 12px;
        }

        .workspace-content-item-remove {
          background: none;
          border: none;
          padding: 4px;
          border-radius: 4px;
          cursor: pointer;
          color: var(--text-error);
          transition: all 0.2s ease;
        }

        .workspace-content-item-remove:hover:not(:disabled) {
          background-color: var(--background-modifier-error);
        }

        .workspace-content-item-remove:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .workspace-content-empty {
          padding: 20px;
          text-align: center;
          color: var(--text-muted);
          font-style: italic;
        }

        .workspace-smart-add-item {
          margin-bottom: 16px;
        }

        .workspace-smart-add-container {
          position: relative;
        }

        .workspace-smart-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          border: 1px solid var(--background-modifier-border);
          border-radius: var(--radius-s);
          background-color: var(--background-primary);
          padding: 8px 12px;
          gap: 8px;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .workspace-smart-input-wrapper:hover {
          border-color: var(--background-modifier-border-hover);
        }

        .workspace-smart-input-wrapper:focus-within {
          border-color: var(--text-accent);
          box-shadow: 0 0 0 2px rgba(var(--text-accent-rgb), 0.1);
        }

        .workspace-smart-input-wrapper.has-suggestions {
          border-radius: 0 0 var(--radius-s) var(--radius-s);
          border-top-color: transparent;
        }

        .workspace-smart-input-wrapper.has-suggestions:focus-within {
          border-radius: 0 0 var(--radius-s) var(--radius-s);
          border-top-color: var(--text-accent);
        }

        .workspace-smart-add-container:focus-within .workspace-suggestions {
          border-color: var(--text-accent);
          box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.1), 0 0 0 2px rgba(var(--text-accent-rgb), 0.1);
        }

        .workspace-smart-input {
          flex: 1;
          padding: 0;
          border: none;
          background: transparent;
          color: var(--text-normal);
          font-size: 14px;
          outline: none;
          min-height: 20px;
        }

        .workspace-smart-input:focus {
          outline: none;
        }

        .workspace-smart-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .workspace-smart-input::placeholder {
          color: var(--text-muted);
          font-style: italic;
        }

        .workspace-smart-add-icon {
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .workspace-smart-dropdown-icon {
          color: var(--text-muted);
          flex-shrink: 0;
          transition: transform 0.2s ease;
        }

        .workspace-smart-dropdown-icon-up {
          transform: rotate(180deg);
        }



        .workspace-suggestions {
          position: absolute;
          bottom: 100%;
          left: 0;
          right: 0;
          background-color: var(--background-primary);
          border: 1px solid var(--background-modifier-border);
          border-bottom: none;
          border-radius: var(--radius-s) var(--radius-s) 0 0;
          box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.1);
          z-index: 1000;
          max-height: 160px;
          overflow-y: auto;
          scrollbar-width: thin;
          margin-bottom: -1px;
        }

        .workspace-suggestions::-webkit-scrollbar {
          width: 6px;
        }

        .workspace-suggestions::-webkit-scrollbar-track {
          background: transparent;
        }

        .workspace-suggestions::-webkit-scrollbar-thumb {
          background-color: var(--background-modifier-border);
          border-radius: 3px;
        }

        .workspace-suggestions::-webkit-scrollbar-thumb:hover {
          background-color: var(--background-modifier-border-hover);
        }

        .workspace-suggestion-item {
          padding: 10px 12px;
          cursor: pointer;
          border-bottom: 1px solid var(--background-modifier-border);
          transition: all 0.2s ease;
        }

        .workspace-suggestion-item:first-child {
          border-radius: var(--radius-s) var(--radius-s) 0 0;
        }

        .workspace-suggestion-item:last-child {
          border-bottom: none;
        }

        .workspace-suggestion-item:hover,
        .workspace-suggestion-item.selected {
          background-color: var(--background-modifier-hover);
        }

        .workspace-suggestion-item.selected {
          background-color: var(--background-modifier-active-hover);
        }

        .workspace-suggestion-content {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .workspace-suggestion-text {
          flex: 1;
          font-weight: 500;
          color: var(--text-normal);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .workspace-suggestion-type {
          font-size: 11px;
          color: var(--text-muted);
          background-color: var(--background-secondary);
          padding: 2px 6px;
          border-radius: calc(var(--radius-s) - 1px);
          flex-shrink: 0;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .workspace-suggestion-item:hover .workspace-suggestion-type,
        .workspace-suggestion-item.selected .workspace-suggestion-type {
          background-color: var(--background-modifier-border);
          color: var(--text-normal);
        }

        .workspace-smart-add-tip {
          font-size: 12px;
          color: var(--text-muted);
          line-height: 1.4;
          margin-top: 8px;
          padding: 0 2px;
          background-color: var(--background-secondary-alt);
          padding: 8px 12px;
          border-radius: var(--radius-s);
          border-left: 2px solid var(--text-accent);
        }

        .workspace-edit-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 16px 20px;
          border-top: 1px solid var(--background-modifier-border);
        }

        .workspace-edit-btn {
          padding: 8px 16px;
          border-radius: var(--radius-s);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .workspace-edit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .workspace-edit-btn-cancel {
          background-color: var(--background-secondary);
          border: 1px solid var(--background-modifier-border);
          color: var(--text-normal);
        }

        .workspace-edit-btn-cancel:hover:not(:disabled) {
          background-color: var(--background-modifier-hover);
        }

        .workspace-edit-btn-save {
          background-color: var(--text-accent);
          border: 1px solid var(--text-accent);
          color: var(--text-on-accent);
        }

        .workspace-edit-btn-save:hover:not(:disabled) {
          background-color: var(--text-accent-hover);
        }
        `}
      </style>
    </div>
  )
}

export default WorkspaceEditModal
