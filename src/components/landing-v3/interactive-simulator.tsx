import { CheckCircle2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function InteractiveSimulator() {
  return (
    <section id='simulasi' className='py-20 bg-canvas border-b border-rule'>
      <div className='mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8'>
        {/* Section Header */}
        <div className='max-w-3xl'>
          <h2 className='font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink leading-tight text-balance'>
            Kuitansi Harian, Otomatis Jadi Jurnal Seimbang
          </h2>
          <p className='mt-2 text-sm text-ink-soft leading-relaxed max-w-2xl'>
            Siap untuk bank, investor, dan pajak — tanpa rekap manual.
          </p>
        </div>

        {/* Animasi video transformasi nota menjadi tiket bank */}
        <div className='mt-10 rounded-3xl border border-rule bg-paper p-6 sm:p-8 shadow-sm'>
          <div className='grid gap-8 lg:grid-cols-12 items-center'>
            {/* Video Player Box - Clean without overlays */}
            <div className='lg:col-span-7 relative aspect-16/9 rounded-2xl overflow-hidden border border-rule bg-canvas shadow-md'>
              <video
                playsInline
                loop
                muted
                autoPlay
                preload='metadata'
                poster='/illustrations/v3/receipt-to-bank-ticket.png'
                className='w-full h-full object-cover'
              >
                <source
                  src='/assets/simulator_transform.mp4'
                  type='video/mp4'
                />
                Browser Anda tidak mendukung pemutar video HTML5.
              </video>
            </div>

            {/* Video Narrative Steps (3 Detik Transformasi) */}
            <div className='lg:col-span-5 space-y-4'>
              <div className='inline-flex items-center gap-1.5 rounded-md bg-debit/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-debit'>
                <CheckCircle2 className='size-3.5' />
                <span>Alur Otomasi Akunio</span>
              </div>

              <h3 className='font-display text-2xl font-bold text-ink leading-snug'>
                Satu Lembar Nota Menjadi Fondasi Usaha Naik Kelas
              </h3>

              <ol className='space-y-3 pt-1 text-xs'>
                <li className='flex items-start gap-3 rounded-xl border border-rule bg-canvas/50 p-3'>
                  <span className='font-mono font-bold text-terra text-sm'>
                    01
                  </span>
                  <div>
                    <p className='font-bold text-ink'>
                      Foto Struk &amp; Nota di Meja
                    </p>
                    <p className='text-ink-soft mt-0.5 leading-relaxed'>
                      Kamera ponsel memindai tanggal, vendor, dan rincian
                      nominal belanja atau penjualan.
                    </p>
                  </div>
                </li>

                <li className='flex items-start gap-3 rounded-xl border border-rule bg-canvas/50 p-3'>
                  <span className='font-mono font-bold text-terra text-sm'>
                    02
                  </span>
                  <div>
                    <p className='font-bold text-ink'>
                      Penyusunan Jurnal Debit-Kredit Seimbang
                    </p>
                    <p className='text-ink-soft mt-0.5 leading-relaxed'>
                      Akunio memetakan transaksi ke Bagan Akun Standar yang ada
                      di sistem kamu.
                    </p>
                  </div>
                </li>

                <li className='flex items-start gap-3 rounded-xl border border-debit/30 bg-debit/5 p-3'>
                  <span className='font-mono font-bold text-debit text-sm'>
                    03
                  </span>
                  <div>
                    <p className='font-bold text-debit'>
                      Laporan Resmi Tersusun Seketika
                    </p>
                    <p className='text-ink-soft mt-0.5 leading-relaxed'>
                      Laporan keuangan Neraca &amp; Laba Rugi resmi siap untuk
                      dipergunakan sesuai kebutuhan.
                    </p>
                  </div>
                </li>
              </ol>

              <div className='pt-2'>
                <Button
                  asChild
                  className='w-full bg-terra hover:brightness-110 text-white font-bold h-11 text-xs shadow-sm'
                >
                  <a
                    href='/daftar'
                    className='flex items-center justify-center gap-2'
                  >
                    <span>Mulai Rapikan Nota Anda Sekarang</span>
                    <ArrowRight className='size-3.5' />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
