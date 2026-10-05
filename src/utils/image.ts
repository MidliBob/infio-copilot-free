import { MentionableImage } from '../types/mentionable'

export function parseImageDataUrl(dataUrl: string): {
	mimeType: string
	base64Data: string
} {
	const matches = /^data:([^;]+);base64,(.+)/.exec(dataUrl)
	if (!matches) {
		throw new Error('Invalid image data URL format')
	}
	const [, mimeType, base64Data] = matches
	return { mimeType, base64Data }
}

export async function fileToMentionableImage(
	file: File,
): Promise<MentionableImage> {
	const base64Data = await fileToBase64(file)
	return {
		type: 'image',
		name: file.name,
		mimeType: file.type,
		data: base64Data,
	}
}

function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.readAsDataURL(file)
		reader.onload = () => {
		  if (typeof reader.result === 'string') {
		    resolve(reader.result)
		  } else {
		    reject(new Error('Unexpected file reader result type'))
		  }
		}
		reader.onerror = () => { reject(new Error('Failed to read file')); }
	})
}
