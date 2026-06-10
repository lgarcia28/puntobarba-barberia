import Foundation
import PDFKit
import Cocoa

let pdfPath = "/Users/leonel/Desktop/Proyectos/Punto Barba/VIP CLUB.pdf"
let outDir = "/Users/leonel/Desktop/Proyectos/Punto Barba/scratch_extracted_images"

let url = URL(fileURLWithPath: pdfPath)
guard let document = PDFDocument(url: url) else {
    print("Failed to load PDF document")
    exit(1)
}

print("Total pages: \(document.pageCount)")

func renderPage(pageIndex: Int, filename: String) {
    guard let page = document.page(at: pageIndex) else {
        print("Page \(pageIndex) not found")
        return
    }
    
    let pageRect = page.bounds(for: .mediaBox)
    print("Page \(pageIndex) size: \(pageRect.size.width) x \(pageRect.size.height)")
    
    let scale: CGFloat = 2.0
    let size = CGSize(width: pageRect.size.width * scale, height: pageRect.size.height * scale)
    
    let image = NSImage(size: size)
    image.lockFocus()
    
    guard let context = NSGraphicsContext.current?.cgContext else {
        print("Failed to get graphics context")
        image.unlockFocus()
        return
    }
    
    context.setFillColor(NSColor.white.cgColor)
    context.fill(CGRect(origin: .zero, size: size))
    
    context.scaleBy(x: scale, y: scale)
    
    page.draw(with: .mediaBox, to: context)
    
    image.unlockFocus()
    
    guard let tiffData = image.tiffRepresentation,
          let bitmapRep = NSBitmapImageRep(data: tiffData),
          let pngData = bitmapRep.representation(using: .png, properties: [:]) else {
        print("Failed to convert image to PNG")
        return
    }
    
    let outPath = "\(outDir)/\(filename)"
    do {
        try pngData.write(to: URL(fileURLWithPath: outPath))
        print("Saved page \(pageIndex + 1) to \(outPath)")
    } catch {
        print("Failed to write PNG: \(error)")
    }
}

renderPage(pageIndex: 0, filename: "page_1.png")
renderPage(pageIndex: 2, filename: "page_3.png")
